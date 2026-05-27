import { contextBridge, ipcRenderer } from 'electron';
import type { ConnectionStatus, DaemonEvent, DaemonRequest } from '@shared/protocol';

type EventListener = (evt: DaemonEvent) => void;
type FsListener = (root: string) => void;
type StatusListener = (status: ConnectionStatus) => void;
const listeners = new Set<EventListener>();
const fsListeners = new Set<FsListener>();
const statusListeners = new Set<StatusListener>();

ipcRenderer.on('daemon:event', (_e, evt: DaemonEvent) => {
  for (const l of listeners) l(evt);
});

ipcRenderer.on('daemon:status', (_e, status: ConnectionStatus) => {
  for (const l of statusListeners) l(status);
});

ipcRenderer.on('fs:changed', (_e, root: string) => {
  for (const l of fsListeners) l(root);
});

const api = {
  daemon: {
    ready: (): Promise<boolean> => ipcRenderer.invoke('daemon:ready'),
    request: <T = unknown>(req: DaemonRequest): Promise<T> =>
      ipcRenderer.invoke('daemon:request', req) as Promise<T>,
    reconnect: (): Promise<boolean> => ipcRenderer.invoke('daemon:reconnect'),
    // Fire-and-forget channels for hot input/resize paths — no Promise,
    // no round trip. Use these instead of request() for keystrokes.
    write: (id: string, data: string): void => {
      ipcRenderer.send('daemon:write', id, data);
    },
    resize: (id: string, cols: number, rows: number): void => {
      ipcRenderer.send('daemon:resize', id, cols, rows);
    },
    onEvent: (cb: EventListener): (() => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onStatus: (cb: StatusListener): (() => void) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
  },
  git: {
    snapshot: (cwd: string) => ipcRenderer.invoke('git:snapshot', cwd),
    diff: (cwd: string, file: string, staged: boolean) =>
      ipcRenderer.invoke('git:diff', cwd, file, staged),
    branches: (cwd: string) => ipcRenderer.invoke('git:branches', cwd),
    log: (cwd: string, limit?: number) => ipcRenderer.invoke('git:log', cwd, limit),
    checkout: (cwd: string, branch: string, create: boolean) =>
      ipcRenderer.invoke('git:checkout', cwd, branch, create),
    pull: (cwd: string) => ipcRenderer.invoke('git:pull', cwd),
    push: (cwd: string) => ipcRenderer.invoke('git:push', cwd),
    stage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:stage', cwd, files),
    unstage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:unstage', cwd, files),
    discard: (cwd: string, files: string[]) => ipcRenderer.invoke('git:discard', cwd, files),
    abort: (cwd: string) => ipcRenderer.invoke('git:abort', cwd),
    continue: (cwd: string) => ipcRenderer.invoke('git:continue', cwd),
    commit: (cwd: string, message: string, opts: { amend?: boolean; signoff?: boolean }) =>
      ipcRenderer.invoke('git:commit', cwd, message, opts),
    stageHunks: (req: unknown) => ipcRenderer.invoke('git:stageHunks', req),
  },
  fs: {
    watch: (root: string) => ipcRenderer.invoke('fs:watch', root),
    unwatch: (root: string) => ipcRenderer.invoke('fs:unwatch', root),
    onChanged: (cb: FsListener): (() => void) => {
      fsListeners.add(cb);
      return () => fsListeners.delete(cb);
    },
  },
  persist: {
    read: (path: string): Promise<string | null> => ipcRenderer.invoke('persist:read', path),
    write: (path: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke('persist:write', path, content),
    paths: (): Promise<{ layout: string; pinned: string }> =>
      ipcRenderer.invoke('persist:paths'),
  },
  platform: process.platform,
  env: {
    home: process.env.HOME ?? process.env.USERPROFILE ?? '/',
    shell: process.env.SHELL ?? (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh'),
  },
};

contextBridge.exposeInMainWorld('runner', api);

export type RunnerApi = typeof api;
