import { contextBridge, ipcRenderer } from 'electron';
import type { ConnectionStatus, DaemonEvent, DaemonRequest, UpdateInfo } from '@shared/protocol';

type EventListener = (evt: DaemonEvent) => void;
type FsListener = (root: string) => void;
type StatusListener = (status: ConnectionStatus) => void;
type UpdateListener = (info: UpdateInfo) => void;
type UpToDateListener = (info: { version: string }) => void;
type DownloadProgress = { downloaded: number; total: number; percent: number };
type DownloadProgressListener = (p: DownloadProgress) => void;
type DownloadedListener = (info: { version: string }) => void;
type DownloadErrorListener = (info: { message: string }) => void;
const listeners = new Set<EventListener>();
const fsListeners = new Set<FsListener>();
const statusListeners = new Set<StatusListener>();
const updateListeners = new Set<UpdateListener>();
const upToDateListeners = new Set<UpToDateListener>();
const progressListeners = new Set<DownloadProgressListener>();
const downloadedListeners = new Set<DownloadedListener>();
const downloadErrorListeners = new Set<DownloadErrorListener>();

ipcRenderer.on('daemon:event', (_e, evt: DaemonEvent) => {
  for (const l of listeners) l(evt);
});

ipcRenderer.on('daemon:status', (_e, status: ConnectionStatus) => {
  for (const l of statusListeners) l(status);
});

ipcRenderer.on('fs:changed', (_e, root: string) => {
  for (const l of fsListeners) l(root);
});

ipcRenderer.on('update:available', (_e, info: UpdateInfo) => {
  for (const l of updateListeners) l(info);
});

ipcRenderer.on('update:none', (_e, info: { version: string }) => {
  for (const l of upToDateListeners) l(info);
});

ipcRenderer.on('update:download-progress', (_e, p: DownloadProgress) => {
  for (const l of progressListeners) l(p);
});

ipcRenderer.on('update:downloaded', (_e, info: { version: string }) => {
  for (const l of downloadedListeners) l(info);
});

ipcRenderer.on('update:download-error', (_e, info: { message: string }) => {
  for (const l of downloadErrorListeners) l(info);
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
  update: {
    check: (): Promise<void> => ipcRenderer.invoke('update:check'),
    open: (url: string): Promise<void> => ipcRenderer.invoke('update:open', url),
    version: (): Promise<string> => ipcRenderer.invoke('update:version'),
    download: (): Promise<void> => ipcRenderer.invoke('update:download'),
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    onAvailable: (cb: UpdateListener): (() => void) => {
      updateListeners.add(cb);
      return () => updateListeners.delete(cb);
    },
    onUpToDate: (cb: UpToDateListener): (() => void) => {
      upToDateListeners.add(cb);
      return () => upToDateListeners.delete(cb);
    },
    onProgress: (cb: DownloadProgressListener): (() => void) => {
      progressListeners.add(cb);
      return () => progressListeners.delete(cb);
    },
    onDownloaded: (cb: DownloadedListener): (() => void) => {
      downloadedListeners.add(cb);
      return () => downloadedListeners.delete(cb);
    },
    onError: (cb: DownloadErrorListener): (() => void) => {
      downloadErrorListeners.add(cb);
      return () => downloadErrorListeners.delete(cb);
    },
  },
  platform: process.platform,
  env: {
    home: process.env.HOME ?? process.env.USERPROFILE ?? '/',
    shell: process.env.SHELL ?? (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh'),
  },
};

contextBridge.exposeInMainWorld('runner', api);

export type RunnerApi = typeof api;
