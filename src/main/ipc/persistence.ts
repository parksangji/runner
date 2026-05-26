import type { IpcMain } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { LAYOUT_JSON, PINNED_PROJECTS_JSON, appDataDir } from '@shared/paths';

const allow = new Set<string>([LAYOUT_JSON(), PINNED_PROJECTS_JSON()]);

function assertAllowed(path: string): void {
  if (!allow.has(path)) {
    throw new Error(`Path not allowlisted for persistence IPC: ${path}`);
  }
}

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export const PERSIST_KEYS = {
  LAYOUT: LAYOUT_JSON(),
  PINNED: PINNED_PROJECTS_JSON(),
} as const;

export function registerPersistenceIpc(ipc: IpcMain): void {
  // Make sure the data dir exists once.
  mkdirSync(appDataDir(), { recursive: true });

  ipc.handle('persist:read', (_e, path: string): string | null => {
    assertAllowed(path);
    if (!existsSync(path)) return null;
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  });

  ipc.handle('persist:write', (_e, path: string, content: string): boolean => {
    assertAllowed(path);
    ensureDir(path);
    writeFileSync(path, content, 'utf8');
    return true;
  });

  ipc.handle('persist:paths', () => ({
    layout: PERSIST_KEYS.LAYOUT,
    pinned: PERSIST_KEYS.PINNED,
  }));
}
