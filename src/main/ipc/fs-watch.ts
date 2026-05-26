import { BrowserWindow, type IpcMain } from 'electron';
import chokidar, { type FSWatcher } from 'chokidar';

const watchers = new Map<string, FSWatcher>();
const debounceTimers = new Map<string, NodeJS.Timeout>();

function notify(root: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('fs:changed', root);
  }
}

function schedule(root: string): void {
  const existing = debounceTimers.get(root);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    root,
    setTimeout(() => {
      debounceTimers.delete(root);
      notify(root);
    }, 150)
  );
}

export function registerFsWatchIpc(ipc: IpcMain): void {
  ipc.handle('fs:watch', (_e, root: string) => {
    if (watchers.has(root)) return true;
    const watcher = chokidar.watch(root, {
      ignored: [/(^|[\/\\])\../, /node_modules/, /dist/, /out/],
      ignoreInitial: true,
      depth: 8,
      persistent: true,
    });
    watcher.on('all', () => schedule(root));
    watchers.set(root, watcher);
    return true;
  });

  ipc.handle('fs:unwatch', async (_e, root: string) => {
    const w = watchers.get(root);
    if (!w) return false;
    await w.close();
    watchers.delete(root);
    return true;
  });
}

export function disposeWatchers(): void {
  for (const w of watchers.values()) void w.close();
  watchers.clear();
}
