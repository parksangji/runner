import { BrowserWindow, type IpcMain } from 'electron';
import { ensureDaemon, getClient } from '../daemon-supervisor';
import type { DaemonClient } from '../daemon-client';
import type { DaemonEvent, DaemonRequest, SessionId } from '@shared/protocol';

// The client instance we've attached the event forwarder to. ensureDaemon()
// can hand back a *new* client after a reconnect (e.g. the daemon was killed
// and respawned); a stale boolean flag would leave the forwarder bound to the
// dead client, so live events (cwd/exit/…) would silently stop reaching the
// renderer. Track the instance instead and re-attach whenever it changes.
let forwarderClient: DaemonClient | null = null;

function broadcast(evt: DaemonEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('daemon:event', evt);
  }
}

function ensureForwarder(client: DaemonClient): void {
  if (forwarderClient === client) return;
  client.on('event', (evt: DaemonEvent) => broadcast(evt));
  forwarderClient = client;
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
    getClient().close();
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
