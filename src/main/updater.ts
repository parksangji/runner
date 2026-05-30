import { app, ipcMain, shell, net, type BrowserWindow, type IpcMain } from 'electron';
import { request } from 'node:https';
import { spawn } from 'node:child_process';
import {
  createWriteStream,
  createReadStream,
  mkdirSync,
  existsSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

// macOS-aware updater. On every platform we ask GitHub for the latest release
// and surface a "new version available" toast. On macOS we additionally know
// how to fetch the DMG, verify it against latest-mac.yml, stage the new .app
// bundle, and swap it in atomically via a detached shell script that outlives
// our own process. We can't use electron-updater's Squirrel-based path because
// the build is unsigned — Squirrel.Mac refuses to install an update whose
// designated requirement doesn't match the running app's.

const REPO_OWNER = 'parksangji';
const REPO_NAME = 'runner';
const REPO = `${REPO_OWNER}/${REPO_NAME}`;

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

// === Download + install (macOS only) ===

interface StagedUpdate {
  version: string;
  /** New .app bundle copied out of the mounted DMG, ready to swap in. */
  stagedAppPath: string;
  /** The currently-running .app bundle that will be replaced. */
  targetAppPath: string;
}

let staged: StagedUpdate | null = null;
let downloading = false;

function send(win: BrowserWindow | null, channel: string, payload?: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function stagingDir(): string {
  const dir = join(app.getPath('userData'), 'updates');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Wipe leftover files from a previous (possibly aborted) update. */
function cleanStaging(): void {
  const dir = stagingDir();
  for (const name of ['pending.dmg', 'staged.app']) {
    const p = join(dir, name);
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore — the next attempt will overwrite */
    }
  }
}

/** /Applications/Runner.app from /Applications/Runner.app/Contents/MacOS/Runner. */
function findCurrentAppPath(): string {
  let cur = dirname(app.getPath('exe'));
  while (cur !== '/' && !cur.endsWith('.app')) cur = dirname(cur);
  if (!cur.endsWith('.app')) throw new Error('Not running from a .app bundle');
  return cur;
}

function dmgAssetName(version: string): string {
  // Two assets per release: arm64 build has the arch suffix, x64 build doesn't.
  return process.arch === 'arm64' ? `Runner-${version}-arm64.dmg` : `Runner-${version}.dmg`;
}

function assetUrl(version: string, name: string): string {
  return `https://github.com/${REPO}/releases/download/v${version}/${name}`;
}

/** Pull the matching asset's sha512 out of latest-mac.yml. The format is stable
 *  enough that a hand-rolled parse is cheaper than carrying a YAML dep.
 *  Exported for testing. */
export function parseManifest(yaml: string, targetName: string): string | null {
  const lines = yaml.split(/\r?\n/);
  let url = '';
  let sha = '';
  const captureIfMatched = (): string | null =>
    url.endsWith(targetName) && sha ? sha : null;
  for (const line of lines) {
    const um = line.match(/^\s*-\s*url:\s*(.+?)\s*$/);
    if (um) {
      const prev = captureIfMatched();
      if (prev) return prev;
      url = um[1]!;
      sha = '';
      continue;
    }
    const sm = line.match(/^\s+sha512:\s*(.+?)\s*$/);
    if (sm && !sha) sha = sm[1]!;
  }
  return captureIfMatched();
}

/** Fetch latest-mac.yml from the release and return the SHA-512 (base64) for
 *  the arch-appropriate DMG. */
async function fetchAssetSha(version: string, assetName: string): Promise<string | null> {
  const url = assetUrl(version, 'latest-mac.yml');
  try {
    const body = await netGetText(url);
    return parseManifest(body, assetName);
  } catch {
    return null;
  }
}

function netGetText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url, redirect: 'follow' });
    let body = '';
    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.on('data', (c) => (body += c.toString('utf8')));
      res.on('end', () => resolve(body));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function netDownload(
  url: string,
  dest: string,
  onProgress: (downloaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    let downloaded = 0;
    let lastReport = 0;
    const fail = (err: Error): void => {
      file.close();
      try {
        rmSync(dest, { force: true });
      } catch {
        /* ignore */
      }
      reject(err);
    };
    const req = net.request({ method: 'GET', url, redirect: 'follow' });
    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        fail(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const total = Number(res.headers['content-length'] ?? 0);
      res.on('data', (c) => {
        const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
        file.write(buf);
        downloaded += buf.length;
        const now = Date.now();
        if (now - lastReport > 200) {
          lastReport = now;
          onProgress(downloaded, total);
        }
      });
      res.on('end', () => {
        file.end(() => {
          onProgress(downloaded, total);
          resolve();
        });
      });
      res.on('error', fail);
    });
    req.on('error', fail);
    req.end();
  });
}

function sha512Base64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512');
    const stream = createReadStream(filePath);
    stream.on('data', (c) => hash.update(c));
    stream.on('end', () => resolve(hash.digest('base64')));
    stream.on('error', reject);
  });
}

function spawnAsync(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c) => (stdout += c.toString('utf8')));
    child.stderr?.on('data', (c) => (stderr += c.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

/** Parse `hdiutil attach` output for the mount point of the data partition.
 *  The output is tab-separated; the last column on a line is the mount path. */
function parseHdiutilMount(out: string): string | null {
  for (const line of out.split('\n')) {
    const parts = line.split('\t').map((s) => s.trim());
    const last = parts[parts.length - 1];
    if (last && last.startsWith('/Volumes/')) return last;
  }
  return null;
}

async function downloadAndStage(getWin: () => BrowserWindow | null): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Auto-update only supported on macOS');
  if (downloading) return;
  downloading = true;
  let mountPoint: string | null = null;
  const dir = stagingDir();
  const dmgPath = join(dir, 'pending.dmg');
  const stagedPath = join(dir, 'staged.app');
  try {
    cleanStaging();
    const info = await fetchLatestRelease();
    if (!info) throw new Error('Could not fetch release info');
    if (!isNewer(info.version, app.getVersion())) {
      throw new Error('Already up to date');
    }
    const asset = dmgAssetName(info.version);
    const expectedSha = await fetchAssetSha(info.version, asset);
    if (!expectedSha) throw new Error(`Could not find ${asset} in latest-mac.yml`);

    // Download
    const url = assetUrl(info.version, asset);
    await netDownload(url, dmgPath, (downloaded, total) => {
      const percent = total > 0 ? Math.floor((downloaded / total) * 100) : 0;
      send(getWin(), 'update:download-progress', { downloaded, total, percent });
    });

    // Verify
    const got = await sha512Base64(dmgPath);
    if (got !== expectedSha) {
      throw new Error('Downloaded DMG failed SHA-512 verification');
    }

    // Mount
    const mountRes = await spawnAsync('hdiutil', [
      'attach',
      dmgPath,
      '-nobrowse',
      '-readonly',
      '-noautoopen',
    ]);
    if (mountRes.code !== 0) {
      throw new Error(`hdiutil attach failed: ${mountRes.stderr || mountRes.stdout}`);
    }
    mountPoint = parseHdiutilMount(mountRes.stdout);
    if (!mountPoint) throw new Error('Could not determine DMG mount point');

    // Copy the .app out. cp -R preserves symlinks and bundle structure; on a
    // read-only DMG that's the safe choice (rsync would also work but pulls
    // in extra flags to behave the same way).
    const sourceApp = join(mountPoint, 'Runner.app');
    if (!existsSync(sourceApp)) throw new Error(`Runner.app missing in ${mountPoint}`);
    const cp = await spawnAsync('cp', ['-R', sourceApp, stagedPath]);
    if (cp.code !== 0) {
      throw new Error(`cp failed: ${cp.stderr || cp.stdout}`);
    }

    // Detach + delete the DMG to free ~100MB before the user clicks Install.
    await spawnAsync('hdiutil', ['detach', mountPoint, '-quiet']).catch(() => {
      /* ignore — best-effort cleanup */
    });
    mountPoint = null;
    try {
      rmSync(dmgPath, { force: true });
    } catch {
      /* ignore */
    }

    staged = {
      version: info.version,
      stagedAppPath: stagedPath,
      targetAppPath: findCurrentAppPath(),
    };
    send(getWin(), 'update:downloaded', { version: info.version });
  } catch (err) {
    if (mountPoint) {
      await spawnAsync('hdiutil', ['detach', mountPoint, '-force', '-quiet']).catch(() => {
        /* ignore */
      });
    }
    cleanStaging();
    const message = err instanceof Error ? err.message : String(err);
    send(getWin(), 'update:download-error', { message });
    throw err;
  } finally {
    downloading = false;
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function performInstall(): void {
  if (!staged) throw new Error('No staged update to install');
  // Hand the swap off to a detached shell script. The script waits for our PID
  // to disappear (we app.quit() right after), then moves the staged bundle on
  // top of the running app's path and re-launches. The daemon is a separate
  // detached process so terminal sessions survive the swap unaffected.
  const script = `#!/bin/sh
set -e
OLD_PID=${shellQuote(String(process.pid))}
STAGED=${shellQuote(staged.stagedAppPath)}
TARGET=${shellQuote(staged.targetAppPath)}

# Wait up to 30s for the running app to exit.
i=0
while kill -0 "$OLD_PID" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 150 ]; then break; fi
  sleep 0.2
done

rm -rf "$TARGET"
mv "$STAGED" "$TARGET"
xattr -cr "$TARGET" 2>/dev/null || true

open -n "$TARGET"
`;
  const scriptPath = join(tmpdir(), `runner-update-${Date.now()}.sh`);
  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);
  const child = spawn('/bin/sh', [scriptPath], { detached: true, stdio: 'ignore' });
  child.unref();
  staged = null;
  app.quit();
}

export function registerUpdaterIpc(ipc: IpcMain, getWin: () => BrowserWindow | null): void {
  // Best-effort cleanup of any orphaned staged files left by an aborted
  // previous run before we start announcing fresh ones.
  cleanStaging();

  ipc.handle('update:check', () => checkForUpdate(getWin, { silent: false }));
  ipc.handle('update:open', (_e, url: string) => shell.openExternal(url));
  ipc.handle('update:version', () => app.getVersion());
  ipc.handle('update:download', async () => {
    try {
      await downloadAndStage(getWin);
    } catch {
      /* error already surfaced via update:download-error */
    }
  });
  ipc.handle('update:install', () => {
    try {
      performInstall();
    } catch (err) {
      send(getWin(), 'update:download-error', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export { ipcMain };
