import { BrowserWindow, type IpcMain } from 'electron';
import { ensureDaemon, getClient, isShuttingDown } from '../daemon-supervisor';
import type { DaemonClient } from '../daemon-client';
import type { ConnectionStatus, DaemonEvent, DaemonRequest, SessionId } from '@shared/protocol';

// The client instance we've attached the event forwarder to. ensureDaemon()
// can hand back a *new* client after a reconnect (e.g. the daemon was killed
// and respawned); a stale boolean flag would leave the forwarder bound to the
// dead client, so live events (cwd/exit/…) would silently stop reaching the
// renderer. Track the instance instead and re-attach whenever it changes.
let forwarderClient: DaemonClient | null = null;
let reconnecting = false;

function broadcast(evt: DaemonEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('daemon:event', evt);
  }
}

function broadcastStatus(status: ConnectionStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('daemon:status', status);
  }
}

function ensureForwarder(client: DaemonClient): void {
  if (forwarderClient === client) return;
  client.on('event', (evt: DaemonEvent) => broadcast(evt));
  // The socket dropped (daemon crashed/restarted, machine slept, …). The
  // daemon keeps PTYs alive, so reconnecting a fresh socket resumes live
  // output; we just need to re-establish it and re-attach this forwarder.
  client.on('close', () => {
    if (isShuttingDown() || forwarderClient !== client) return;
    forwarderClient = null;
    broadcastStatus('reconnecting');
    void reconnectLoop();
  });
  forwarderClient = client;
  broadcastStatus('connected');
}

// Reconnect with capped exponential backoff. After exhausting attempts we
// surface 'disconnected' and stop — the renderer offers a manual Reconnect.
async function reconnectLoop(): Promise<void> {
  if (reconnecting) return;
  reconnecting = true;
  let delay = 250;
  try {
    for (let attempt = 0; attempt < 12 && !isShuttingDown(); attempt++) {
      await new Promise((r) => setTimeout(r, delay));
      try {
        ensureForwarder(await ensureDaemon());
        return;
      } catch {
        delay = Math.min(delay * 2, 3000);
      }
    }
    if (!isShuttingDown()) broadcastStatus('disconnected');
  } finally {
    reconnecting = false;
  }
}

export function registerDaemonIpc(ipc: IpcMain): void {
  ipc.handle('daemon:request', async (_e, req: DaemonRequest) => {
    const client = await ensureDaemon();
    ensureForwarder(client);
    return client.request(req);
  });

  ipc.handle('daemon:ready', async () => {
    ensureForwarder(await ensureDaemon());
    return true;
  });

  ipc.handle('daemon:reconnect', async () => {
    broadcastStatus('reconnecting');
    forwarderClient = null;
    try {
      getClient().close();
    } catch {
      /* no client yet — ensureDaemon will create one */
    }
    ensureForwarder(await ensureDaemon());
    return true;
  });

  // Hot paths: keystroke and resize. ipcMain.on (not handle) avoids the
  // Promise round trip on the renderer side; ensureDaemon has already
  // completed before the window is created so getClient() is sync-safe.
  ipc.on('daemon:write', (_e, id: SessionId, data: string) => {
    try {
      getClient().fireAndForget({ kind: 'write', id, data });
    } catch {
      /* daemon not ready — drop the keystroke rather than throw */
    }
  });

  ipc.on('daemon:resize', (_e, id: SessionId, cols: number, rows: number) => {
    try {
      getClient().fireAndForget({ kind: 'resize', id, cols, rows });
    } catch {
      /* ignore */
    }
  });
}
