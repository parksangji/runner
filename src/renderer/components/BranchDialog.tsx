import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useHotkeys } from 'react-hotkeys-hook';
import { useSessions } from '../stores/sessions';
import { useGit } from '../stores/git';
import { runner } from '../api';

interface DialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useBranchDialog = create<DialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

interface BranchSummary {
  all?: string[];
  branches?: Record<string, { current: boolean; name: string; commit: string }>;
  current?: string;
}

export function BranchDialog(): JSX.Element | null {
  const open = useBranchDialog((s) => s.open);
  const hide = useBranchDialog((s) => s.hide);
  const focused = useSessions((s) => (s.focusedId ? s.sessions[s.focusedId] : null));
  const refresh = useGit((s) => s.refresh);

  const [branches, setBranches] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!focused?.cwd) return;
    try {
      const res = (await runner().git.branches(focused.cwd)) as BranchSummary | null;
      if (!res) return;
      const list = res.all ?? Object.keys(res.branches ?? {});
      setBranches(list.filter((b) => !b.startsWith('remotes/')));
      setCurrent(res.current ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [focused]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setError(null);
      setActiveIdx(0);
      setCreating(false);
      void load();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, load]);

  useHotkeys(
    'escape',
    () => {
      if (open) hide();
    },
    { enableOnFormTags: true, preventDefault: true, enabled: open }
  );

  const filtered = branches.filter((b) =>
    b.toLowerCase().includes(query.toLowerCase())
  );
  const exact = filtered.some((b) => b === query.trim());

  const switchTo = async (branch: string): Promise<void> => {
    if (!focused?.cwd) return;
    setBusy(true);
    setError(null);
    try {
      await runner().git.checkout(focused.cwd, branch, false);
      await refresh(focused.cwd);
      hide();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const create = async (): Promise<void> => {
    const name = query.trim();
    if (!name || !focused?.cwd) return;
    setBusy(true);
    setError(null);
    try {
      await runner().git.checkout(focused.cwd, name, true);
      await refresh(focused.cwd);
      hide();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Switch branch"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div className="modal" style={{ width: 460 }}>
        <header>
          <h2>Branches</h2>
          <button type="button" aria-label="Close" onClick={hide}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>{creating ? 'New branch name' : 'Filter or type to create'}</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIdx((i) => Math.max(0, i - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (creating || (!exact && query.trim())) {
                    void create();
                  } else if (filtered[activeIdx]) {
                    void switchTo(filtered[activeIdx]);
                  }
                }
              }}
              placeholder="branch name…"
            />
          </label>
          <ul role="listbox" className="branch-list" aria-label="Available branches">
            {filtered.map((b, i) => (
              <li
                key={b}
                role="option"
                aria-selected={i === activeIdx}
                className={`branch-row${i === activeIdx ? ' active' : ''}${b === current ? ' current' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => void switchTo(b)}
              >
                <span className="dot">{b === current ? '●' : '○'}</span>
                <span>{b}</span>
              </li>
            ))}
            {filtered.length === 0 && query.trim() ? (
              <li className="branch-row hint">
                <span className="dot">+</span>
                <span>Create new branch "{query.trim()}"</span>
              </li>
            ) : null}
          </ul>
          {error ? (
            <div className="banner err" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <footer>
          <button type="button" onClick={hide} disabled={busy}>
            Cancel (Esc)
          </button>
          {query.trim() && !exact ? (
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy}
              className="primary"
            >
              {busy ? 'Creating…' : `Create + Checkout (Enter)`}
            </button>
          ) : filtered[activeIdx] && filtered[activeIdx] !== current ? (
            <button
              type="button"
              onClick={() => void switchTo(filtered[activeIdx]!)}
              disabled={busy}
              className="primary"
            >
              {busy ? 'Switching…' : `Checkout (Enter)`}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
