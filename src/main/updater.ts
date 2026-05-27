import { app, ipcMain, shell, type BrowserWindow, type IpcMain } from 'electron';
import { request } from 'node:https';

// Notify-style updater: we don't download or self-install (that needs a signed
// app on macOS). We just ask GitHub for the latest published release, and if
// it's newer than the running version we tell the renderer to surface a toast
// with a "Download" button that opens the release page.

const REPO = 'parksangji/runner';

export interface UpdateInfo {
  version: string;
  url: string;
  notes: string;
}

function fetchLatestRelease(): Promise<UpdateInfo | null> {
  return new Promise((resolve) => {
    const req = request(
      {
        host: 'api.github.com',
        path: `/repos/${REPO}/releases/latest`,
        headers: {
          'User-Agent': 'runner-app',
          Accept: 'application/vnd.github+json',
        },
        timeout: 8000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(body) as { tag_name?: string; html_url?: string; name?: string };
            if (!j.tag_name || !j.html_url) return resolve(null);
            resolve({
              version: j.tag_name.replace(/^v/, ''),
              url: j.html_url,
              notes: j.name ?? '',
            });
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}

/** Numeric semver compare on dotted parts; ignores any pre-release suffix. */
function isNewer(remote: string, local: string): boolean {
  const parse = (v: string): number[] =>
    (v.split('-')[0] ?? '').split('.').map((n) => Number(n) || 0);
  const r = parse(remote);
  const l = parse(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = r[i] ?? 0;
    const b = l[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * Check GitHub for a newer release and message the window.
 * `silent` suppresses the "you're up to date" reply (used for startup checks).
 */
export async function checkForUpdate(
  getWin: () => BrowserWindow | null,
  opts: { silent: boolean }
): Promise<void> {
  const info = await fetchLatestRelease();
  const win = getWin();
  if (!win || win.isDestroyed()) return;
  const current = app.getVersion();
  if (info && isNewer(info.version, current)) {
    win.webContents.send('update:available', info);
  } else if (!opts.silent) {
    win.webContents.send('update:none', { version: current });
  }
}

export function registerUpdaterIpc(ipc: IpcMain, getWin: () => BrowserWindow | null): void {
  ipc.handle('update:check', () => checkForUpdate(getWin, { silent: false }));
  ipc.handle('update:open', (_e, url: string) => shell.openExternal(url));
  ipc.handle('update:version', () => app.getVersion());
}

export { ipcMain };
