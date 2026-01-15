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

export interface GitFile {
  path: string;
  index: string;
  working_dir: string;
}

// A plain, structured-clone-safe projection of simple-git's StatusResult.
// simple-git returns a *class instance* (methods like isClean()), which
// Electron's IPC cannot clone ("An object could not be cloned") — so we must
// flatten it to plain arrays/objects before handing it to the renderer.
export interface GitStatus {
  current: string | null;
  modified: string[];
  created: string[];
  deleted: string[];
  not_added: string[];
  conflicted: string[];
  staged: string[];
  files: GitFile[];
}

export interface GitSnapshot {
  repoRoot: string | null;
  branch: string | null;
  ahead: number;
  behind: number;
  status: GitStatus | null;
}

function plainStatus(s: StatusResult): GitStatus {
  return {
    current: s.current,
    modified: s.modified,
    created: s.created,
    deleted: s.deleted,
    not_added: s.not_added,
    conflicted: s.conflicted,
    staged: s.staged,
    files: s.files.map((f) => ({ path: f.path, index: f.index, working_dir: f.working_dir })),
  };
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
      status: plainStatus(status),
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
    const b = await gitAt(root).branch();
    // Flatten to a plain object (see plainStatus note re: structured clone).
    return {
      all: b.all,
      current: b.current,
      branches: Object.fromEntries(
        Object.entries(b.branches).map(([k, v]) => [
          k,
          { current: v.current, name: v.name, commit: v.commit },
        ])
      ),
    };
  });

  // Mutating ops below return `true` rather than simple-git's result objects:
  // those are class instances and would trip Electron's structured clone. The
  // renderer only awaits completion and re-reads status, so a boolean suffices.
  ipc.handle('git:checkout', async (_e, cwd: string, branch: string, create: boolean) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    if (create) await gitAt(root).checkoutLocalBranch(branch);
    else await gitAt(root).checkout(branch);
    return true;
  });

  ipc.handle('git:pull', async (_e, cwd: string) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    await gitAt(root).pull();
    return true;
  });

  ipc.handle('git:push', async (_e, cwd: string) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    await gitAt(root).push();
    return true;
  });

  ipc.handle('git:stage', async (_e, cwd: string, files: string[]) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    await gitAt(root).add(files);
    return true;
  });

  ipc.handle('git:unstage', async (_e, cwd: string, files: string[]) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    await gitAt(root).reset(['HEAD', '--', ...files]);
    return true;
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
      await gitAt(root).commit(message, undefined, flags.length ? { ...Object.fromEntries(flags.map((f) => [f, null])) } : undefined);
      return true;
    }
  );
}
