import { contextBridge, ipcRenderer } from 'electron';
import type { DaemonEvent, DaemonRequest } from '@shared/protocol';

type EventListener = (evt: DaemonEvent) => void;
const listeners = new Set<EventListener>();

ipcRenderer.on('daemon:event', (_e, evt: DaemonEvent) => {
  for (const l of listeners) l(evt);
});

const api = {
  daemon: {
    ready: (): Promise<boolean> => ipcRenderer.invoke('daemon:ready'),
    request: <T = unknown>(req: DaemonRequest): Promise<T> =>
      ipcRenderer.invoke('daemon:request', req) as Promise<T>,
    reconnect: (): Promise<boolean> => ipcRenderer.invoke('daemon:reconnect'),
    onEvent: (cb: EventListener): (() => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  },
  git: {
    snapshot: (cwd: string) => ipcRenderer.invoke('git:snapshot', cwd),
    diff: (cwd: string, file: string, staged: boolean) =>
      ipcRenderer.invoke('git:diff', cwd, file, staged),
    branches: (cwd: string) => ipcRenderer.invoke('git:branches', cwd),
    checkout: (cwd: string, branch: string, create: boolean) =>
      ipcRenderer.invoke('git:checkout', cwd, branch, create),
    pull: (cwd: string) => ipcRenderer.invoke('git:pull', cwd),
    push: (cwd: string) => ipcRenderer.invoke('git:push', cwd),
    stage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:stage', cwd, files),
    unstage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:unstage', cwd, files),
    commit: (cwd: string, message: string, opts: { amend?: boolean; signoff?: boolean }) =>
      ipcRenderer.invoke('git:commit', cwd, message, opts),
  },
  platform: process.platform,
  env: {
    home: process.env.HOME ?? process.env.USERPROFILE ?? '/',
    shell: process.env.SHELL ?? (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh'),
  },
};

contextBridge.exposeInMainWorld('runner', api);

export type RunnerApi = typeof api;
