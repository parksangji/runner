import type { DaemonEvent, DaemonRequest, SessionSummary } from '@shared/protocol';
import type { GitSnapshot } from '@main/ipc/git';
import type { StageHunksRequest } from '@main/ipc/stage-hunks';

interface RunnerApi {
  daemon: {
    ready: () => Promise<boolean>;
    request: <T = unknown>(req: DaemonRequest) => Promise<T>;
    reconnect: () => Promise<boolean>;
    onEvent: (cb: (evt: DaemonEvent) => void) => () => void;
  };
  git: {
    snapshot: (cwd: string) => Promise<GitSnapshot>;
    diff: (cwd: string, file: string, staged: boolean) => Promise<string>;
    branches: (cwd: string) => Promise<unknown>;
    checkout: (cwd: string, branch: string, create: boolean) => Promise<unknown>;
    pull: (cwd: string) => Promise<unknown>;
    push: (cwd: string) => Promise<unknown>;
    stage: (cwd: string, files: string[]) => Promise<unknown>;
    unstage: (cwd: string, files: string[]) => Promise<unknown>;
    commit: (
      cwd: string,
      message: string,
      opts: { amend?: boolean; signoff?: boolean }
    ) => Promise<unknown>;
    stageHunks: (req: StageHunksRequest) => Promise<{ ok: boolean; error?: string }>;
  };
  fs: {
    watch: (root: string) => Promise<boolean>;
    unwatch: (root: string) => Promise<boolean>;
    onChanged: (cb: (root: string) => void) => () => void;
  };
  persist: {
    read: (path: string) => Promise<string | null>;
    write: (path: string, content: string) => Promise<boolean>;
    paths: () => Promise<{ layout: string; pinned: string }>;
  };
  platform: NodeJS.Platform;
  env: { home: string; shell: string };
}

declare global {
  interface Window {
    runner: RunnerApi;
  }
}

export const runner = (): RunnerApi => window.runner;
export type { SessionSummary };
