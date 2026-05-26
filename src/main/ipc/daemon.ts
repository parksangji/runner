import { BrowserWindow, type IpcMain } from 'electron';
import { ensureDaemon, getClient } from '../daemon-supervisor';
import type { DaemonEvent, DaemonRequest } from '@shared/protocol';

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
}
