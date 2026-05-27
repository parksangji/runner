import type { IpcMain } from 'electron';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
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

// An interrupted merge/rebase leaves the repo mid-operation: conflicts must be
// resolved and the op continued, or the whole thing aborted. null = clean.
export type GitOperation = 'merge' | 'rebase' | null;

// A plain projection of one commit from `git log` (simple-git's log summary is
// a class instance — see plainStatus note re: structured clone).
export interface GitCommit {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
}

export interface GitSnapshot {
  repoRoot: string | null;
  branch: string | null;
  ahead: number;
  behind: number;
  status: GitStatus | null;
  operation: GitOperation;
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

// Detect an in-progress merge/rebase by the marker dirs/files git writes into
// the git dir. Rebase wins if both somehow exist (it's the outer operation).
async function operationInProgress(root: string): Promise<GitOperation> {
  try {
    const gitDir = (await gitAt(root).revparse(['--git-dir'])).trim();
    const base = isAbsolute(gitDir) ? gitDir : join(root, gitDir);
    if (existsSync(join(base, 'rebase-merge')) || existsSync(join(base, 'rebase-apply'))) {
      return 'rebase';
    }
    if (existsSync(join(base, 'MERGE_HEAD'))) return 'merge';
    return null;
  } catch {
    return null;
  }
}

export function registerGitIpc(ipc: IpcMain): void {
  ipc.handle('git:snapshot', async (_e, cwd: string): Promise<GitSnapshot> => {
    const root = await repoRoot(cwd);
    if (!root) {
      return { repoRoot: null, branch: null, ahead: 0, behind: 0, status: null, operation: null };
    }
    const g = gitAt(root);
    const status = await g.status();
    return {
      repoRoot: root,
      branch: status.current,
      ahead: status.ahead,
      behind: status.behind,
      status: plainStatus(status),
      operation: await operationInProgress(root),
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

  ipc.handle(
    'git:log',
    async (_e, cwd: string, limit = 50): Promise<GitCommit[]> => {
      const root = await repoRoot(cwd);
      if (!root) return [];
      try {
        const log = await gitAt(root).log({ maxCount: limit });
        return log.all.map((c) => ({
          hash: c.hash,
          date: c.date,
          message: c.message,
          author_name: c.author_name,
          author_email: c.author_email,
        }));
      } catch {
        // No commits yet (unborn HEAD) or other read failure.
        return [];
      }
    }
  );

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

  // Discard working-tree changes. Tracked files are restored from the index
  // (`git checkout -- <file>`); untracked files have no index entry to restore
  // to, so they're deleted from disk. This is destructive and irreversible —
  // the renderer confirms before calling.
  ipc.handle('git:discard', async (_e, cwd: string, files: string[]) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    const g = gitAt(root);
    const status = await g.status();
    const untracked = new Set(status.not_added);
    const tracked = files.filter((f) => !untracked.has(f));
    if (tracked.length) await g.checkout(['--', ...tracked]);
    for (const f of files) {
      if (untracked.has(f)) await rm(join(root, f), { force: true, recursive: true });
    }
    return true;
  });

  // Abort the in-progress merge/rebase, returning the tree to its pre-op state.
  ipc.handle('git:abort', async (_e, cwd: string) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    const op = await operationInProgress(root);
    if (op === 'rebase') await gitAt(root).raw(['rebase', '--abort']);
    else if (op === 'merge') await gitAt(root).raw(['merge', '--abort']);
    return true;
  });

  // Continue the in-progress merge/rebase once conflicts are staged. GIT_EDITOR
  // is stubbed so git doesn't try to open an interactive commit-message editor.
  ipc.handle('git:continue', async (_e, cwd: string) => {
    const root = await repoRoot(cwd);
    if (!root) throw new Error('Not a git repo');
    const op = await operationInProgress(root);
    const g = simpleGit({ baseDir: root }).env({ ...process.env, GIT_EDITOR: 'true' });
    if (op === 'rebase') await g.raw(['rebase', '--continue']);
    else if (op === 'merge') await g.raw(['commit', '--no-edit']);
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
