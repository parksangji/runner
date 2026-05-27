import { useEffect, useMemo, useState } from 'react';
import type { GitSnapshot } from '@main/ipc/git';
import { useSessions } from '../stores/sessions';
import { useGit } from '../stores/git';
import { useProjects } from '../stores/projects';
import { useCommitDialog } from './CommitDialog';
import { useBranchDialog } from './BranchDialog';
import { useLogDialog } from './LogDialog';
import { runner } from '../api';
import { ConflictPanel } from './ConflictPanel';

function basename(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

interface FileRow {
  path: string;
  kind: string;
}

type Status = NonNullable<GitSnapshot['status']>;

function indexKind(status: Status, path: string): string {
  const f = status.files?.find((x) => x.path === path);
  const c = (f?.index ?? '').trim();
  if (c === 'A') return 'A';
  if (c === 'D') return 'D';
  if (c === 'R') return 'R';
  return 'M';
}

function filesFor(status: Status | null, staged: boolean): FileRow[] {
  if (!status) return [];
  if (staged) {
    return (status.staged ?? []).map((path) => ({ path, kind: indexKind(status, path) }));
  }
  const rows: FileRow[] = [];
  for (const f of status.modified) rows.push({ path: f, kind: 'M' });
  for (const f of status.created) rows.push({ path: f, kind: 'A' });
  for (const f of status.deleted) rows.push({ path: f, kind: 'D' });
  for (const f of status.not_added) rows.push({ path: f, kind: '?' });
  for (const f of status.conflicted) rows.push({ path: f, kind: '!' });
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.path) ? false : (seen.add(r.path), true)));
}

/** One git repository (a directory backed by ≥1 terminal). Owns its own
 *  Pull/Push/Commit/Branch toolbar + changed-file list. Clicking a file toggles
 *  the diff view in the center area (see DiffOverlay). */
function RepoGroup({ snap, staged }: { snap: GitSnapshot; staged: boolean }): JSX.Element {
  const repoRoot = snap.repoRoot as string;
  const refresh = useGit((s) => s.refresh);
  const selectedCwd = useProjects((s) => s.selectedCwd);
  const selectedFile = useProjects((s) => s.selectedFile);
  const setSelected = useProjects((s) => s.setSelected);
  const [error, setError] = useState<string | null>(null);

  const files = useMemo(() => filesFor(snap.status, staged), [snap.status, staged]);
  const activeFile = selectedCwd === repoRoot ? selectedFile : null;

  const runGit = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      await fn();
      await refresh(repoRoot);
    } catch (err) {
      setError(`${label} 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="repo-group">
      <div className="repo-header">
        <span className="repo-name" title={repoRoot}>
          {basename(repoRoot)}
        </span>
        {snap.branch ? <span className="branch">⎇ {snap.branch}</span> : null}
        <div className="repo-actions" role="toolbar" aria-label={`Git actions for ${basename(repoRoot)}`}>
          <button type="button" aria-label="Pull" title="Pull" onClick={() => void runGit('Pull', () => runner().git.pull(repoRoot))}>
            ⇣{snap.behind > 0 ? <sup>{snap.behind}</sup> : null}
          </button>
          <button type="button" aria-label="Push" title="Push" onClick={() => void runGit('Push', () => runner().git.push(repoRoot))}>
            ⇡{snap.ahead > 0 ? <sup>{snap.ahead}</sup> : null}
          </button>
          <button type="button" aria-label="Commit" title="Commit" onClick={() => useCommitDialog.getState().show(repoRoot)}>
            ⊙
          </button>
          <button type="button" aria-label="Branch" title="Branch" onClick={() => useBranchDialog.getState().show(repoRoot)}>
            ⎇
          </button>
          <button type="button" aria-label="History" title="History" onClick={() => useLogDialog.getState().show(repoRoot)}>
            🕑
          </button>
        </div>
      </div>

      {error ? (
        <div className="banner err" role="alert">
          {error}
        </div>
      ) : null}

      <ConflictPanel snapshot={snap} cwd={repoRoot} />

      {files.length === 0 ? (
        <div className="repo-empty">변경 없음</div>
      ) : (
        files.map((f) => (
          <div
            key={f.path}
            className={`changed-file${activeFile === f.path ? ' selected' : ''}`}
            onClick={() => setSelected(repoRoot, activeFile === f.path ? null : f.path)}
            role="button"
            tabIndex={0}
          >
            <span className={`status ${f.kind}`}>{f.kind}</span>
            <span className="file-path">{f.path}</span>
            {staged ? (
              <button
                type="button"
                className="file-action"
                title="Unstage"
                aria-label={`Unstage ${f.path}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void runGit('Unstage', () => runner().git.unstage(repoRoot, [f.path]));
                }}
              >
                −
              </button>
            ) : (
              <button
                type="button"
                className="file-action danger"
                title="Discard changes"
                aria-label={`Discard changes to ${f.path}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`${f.path}의 변경을 버립니다. 되돌릴 수 없습니다. 계속할까요?`)) {
                    void runGit('Discard', () => runner().git.discard(repoRoot, [f.path]));
                  }
                }}
              >
                ↺
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export function ChangesPanel(): JSX.Element {
  const sessions = useSessions((s) => s.sessions);
  const snapshots = useGit((s) => s.snapshots);
  const refresh = useGit((s) => s.refresh);
  const staged = useProjects((s) => s.staged);
  const setStaged = useProjects((s) => s.setStaged);

  // Every distinct directory backing a terminal (splits included).
  const cwds = useMemo(
    () => [...new Set(Object.values(sessions).map((s) => s.cwd))],
    [sessions]
  );

  // Make sure each terminal's cwd has a git snapshot so it can surface here.
  useEffect(() => {
    for (const cwd of cwds) void refresh(cwd);
  }, [cwds, refresh]);

  // Resolve each cwd to its repo root and dedupe — directories sharing a repo
  // collapse into one group; non-git directories drop out entirely.
  const repos = useMemo(() => {
    const byRoot = new Map<string, GitSnapshot>();
    for (const cwd of cwds) {
      const snap = Object.values(snapshots).find(
        (sn) => sn.repoRoot && cwd.startsWith(sn.repoRoot)
      );
      if (snap?.repoRoot) byRoot.set(snap.repoRoot, snap);
    }
    return [...byRoot.values()].sort((a, b) =>
      (a.repoRoot ?? '').localeCompare(b.repoRoot ?? '')
    );
  }, [cwds, snapshots]);

  return (
    <aside className="sidebar left changes-panel" aria-label="Changes">
      <div className="right-header">
        <h3>Changes</h3>
        <div className="seg" role="tablist" aria-label="diff source">
          <button
            type="button"
            role="tab"
            aria-selected={!staged}
            className={!staged ? 'active' : ''}
            onClick={() => setStaged(false)}
          >
            Working
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={staged}
            className={staged ? 'active' : ''}
            onClick={() => setStaged(true)}
          >
            Staged
          </button>
        </div>
      </div>

      {repos.length === 0 ? (
        <div className="empty" style={{ padding: 12, color: 'var(--fg-dim)' }}>
          git 저장소가 있는 터미널을 열면 여기에 표시됩니다
        </div>
      ) : (
        repos.map((snap) => (
          <RepoGroup key={snap.repoRoot} snap={snap} staged={staged} />
        ))
      )}
    </aside>
  );
}
