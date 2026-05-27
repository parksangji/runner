import { useCallback, useEffect, useState } from 'react';
import { create } from 'zustand';
import { useHotkeys } from 'react-hotkeys-hook';
import type { GitCommit } from '@main/ipc/git';
import { useSessions } from '../stores/sessions';
import { runner } from '../api';

interface DialogState {
  open: boolean;
  // Repo to show history for. null → fall back to focused session.
  cwd: string | null;
  show: (cwd?: string) => void;
  hide: () => void;
}

export const useLogDialog = create<DialogState>((set) => ({
  open: false,
  cwd: null,
  show: (cwd) => set({ open: true, cwd: cwd ?? null }),
  hide: () => set({ open: false }),
}));

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function LogDialog(): JSX.Element | null {
  const open = useLogDialog((s) => s.open);
  const hide = useLogDialog((s) => s.hide);
  const targetCwd = useLogDialog((s) => s.cwd);
  const focused = useSessions((s) => (s.focusedId ? s.sessions[s.focusedId] : null));

  const cwd = targetCwd ?? focused?.cwd ?? null;

  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!cwd) return;
    setLoading(true);
    setError(null);
    try {
      setCommits(await runner().git.log(cwd, 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    if (open) {
      setCommits([]);
      void load();
    }
  }, [open, load]);

  useHotkeys(
    'escape',
    () => {
      if (open) hide();
    },
    { enableOnFormTags: true, preventDefault: true, enabled: open }
  );

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Commit history"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div className="modal" style={{ width: 620 }}>
        <header>
          <h2>History</h2>
          <button type="button" aria-label="Close" onClick={hide}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          {error ? (
            <div className="banner err" role="alert">
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="empty">불러오는 중…</div>
          ) : commits.length === 0 ? (
            <div className="empty">커밋이 없습니다</div>
          ) : (
            <ul className="commit-list" role="list" aria-label="Commits">
              {commits.map((c) => (
                <li key={c.hash} className="commit-row">
                  <code className="commit-hash" title={c.hash}>
                    {shortHash(c.hash)}
                  </code>
                  <span className="commit-msg" title={c.message}>
                    {c.message}
                  </span>
                  <span className="commit-meta">
                    {c.author_name} · {relativeDate(c.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
