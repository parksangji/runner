import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { appDataDir } from '@shared/paths';
import { registerGitIpc } from './ipc/git';
import { registerDaemonIpc } from './ipc/daemon';
import { registerFsWatchIpc, disposeWatchers } from './ipc/fs-watch';
import { registerStageHunksIpc } from './ipc/stage-hunks';
import { registerPersistenceIpc } from './ipc/persistence';
import { ensureDaemon, shutdownClient } from './daemon-supervisor';

const isDev = !!process.env.ELECTRON_RENDERER_URL;

function ensureAppDataDir(): void {
  mkdirSync(appDataDir(), { recursive: true });
}

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#11131a',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app.whenReady().then(async () => {
  ensureAppDataDir();
  await ensureDaemon();
  registerGitIpc(ipcMain);
  registerDaemonIpc(ipcMain);
  registerFsWatchIpc(ipcMain);
  registerStageHunksIpc(ipcMain);
  registerPersistenceIpc(ipcMain);
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  shutdownClient();
  disposeWatchers();
});
