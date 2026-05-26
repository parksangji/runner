import type { IpcMain } from 'electron';
import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git';

const cache = new Map<string, SimpleGit>();

function gitAt(cwd: string): SimpleGit {
  let g = cache.get(cwd);
  if (!g) {
    g = simpleGit({ baseDir: cwd });
    cache.set(cwd, g);
  }
  return g;
}

export interface GitSnapshot {
  repoRoot: string | null;
  branch: string | null;
  ahead: number;
  behind: number;
  status: StatusResult | null;
}

async function repoRoot(cwd: string): Promise<string | null> {
  try {
    const out = await gitAt(cwd).revparse(['--show-toplevel']);
    return out.trim() || null;
  } catch {
    return null;
  }
}

export function registerGitIpc(ipc: IpcMain): void {
  ipc.handle('git:snapshot', async (_e, cwd: string): Promise<GitSnapshot> => {
    const root = await repoRoot(cwd);
    if (!root) return { repoRoot: null, branch: null, ahead: 0, behind: 0, status: null };
    const g = gitAt(root);
    const status = await g.status();
    return {
      repoRoot: root,
      branch: status.current,
      ahead: status.ahead,
      behind: status.behind,
      status,
    };
  });

  ipc.handle('git:diff', async (_e, cwd: string, file: string, staged: boolean): Promise<string> => {
    const root = await repoRoot(cwd);
    if (!root) return '';
    const args = ['--no-color', '--unified=3'];
    if (staged) args.push('--cached');
    args.push('--', file);
    return gitAt(root).diff(args);
  });

  ipc.handle('git:branches', async (_e, cwd: string) => {
    const root = await repoRoot(cwd);
    if (!root) return null;
    return gitAt(root).branch();
  });

  ipc.handle('git:checkout', async (_e, cwd: string, branch: string, create: boolean) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    if (create) return gitAt(root).checkoutLocalBranch(branch);
    return gitAt(root).checkout(branch);
  });

  ipc.handle('git:pull', async (_e, cwd: string) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    return gitAt(root).pull();
  });

  ipc.handle('git:push', async (_e, cwd: string) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    return gitAt(root).push();
  });

  ipc.handle('git:stage', async (_e, cwd: string, files: string[]) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    return gitAt(root).add(files);
  });

  ipc.handle('git:unstage', async (_e, cwd: string, files: string[]) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    return gitAt(root).reset(['HEAD', '--', ...files]);
  });

  ipc.handle(
    'git:commit',
    async (
      _e,
      cwd: string,
      message: string,
      opts: { amend?: boolean; signoff?: boolean }
    ) => {
      const root = await repoRoot(cwd);
      if (!root) throw new Error('Not a git repo');
      const flags: string[] = [];
      if (opts.amend) flags.push('--amend');
      if (opts.signoff) flags.push('--signoff');
      return gitAt(root).commit(message, undefined, flags.length ? { ...Object.fromEntries(flags.map((f) => [f, null])) } : undefined);
    }
  );
}
