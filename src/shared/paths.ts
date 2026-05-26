import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export function appDataDir(): string {
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'runner');
    case 'win32':
      return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'runner');
    default:
      return join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'runner');
  }
}

export const DAEMON_SOCKET = (): string => join(appDataDir(), 'daemon.sock');
export const DAEMON_PID = (): string => join(appDataDir(), 'daemon.pid');
export const SESSIONS_JSON = (): string => join(appDataDir(), 'sessions.json');
export const LAYOUT_JSON = (): string => join(appDataDir(), 'layout.json');
export const PINNED_PROJECTS_JSON = (): string => join(appDataDir(), 'pinned-projects.json');
