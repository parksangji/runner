import { BrowserWindow, type IpcMain } from 'electron';
import { ensureDaemon, getClient } from '../daemon-supervisor';
import type { DaemonEvent, DaemonRequest, SessionId } from '@shared/protocol';

let listenerInstalled = false;

function broadcast(evt: DaemonEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('daemon:event', evt);
  }
}

export function registerDaemonIpc(ipc: IpcMain): void {
  ipc.handle('daemon:request', async (_e, req: DaemonRequest) => {
    const client = await ensureDaemon();
    if (!listenerInstalled) {
      client.on('event', (evt: DaemonEvent) => broadcast(evt));
      listenerInstalled = true;
    }
    return client.request(req);
  });

  ipc.handle('daemon:ready', async () => {
    await ensureDaemon();
    return true;
  });

  ipc.handle('daemon:reconnect', async () => {
    getClient().close();
    await ensureDaemon();
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
