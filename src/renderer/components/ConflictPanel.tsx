import { useEffect, useMemo, useState } from 'react';
import type { GitSnapshot } from '@main/ipc/git';
import { useProjects } from '../stores/projects';
import { useGit } from '../stores/git';
import { runner } from '../api';

interface Props {
  snapshot: GitSnapshot | null;
  cwd: string;
}

export function ConflictPanel({ snapshot, cwd }: Props): JSX.Element | null {
  const conflicted = useMemo(() => snapshot?.status?.conflicted ?? [], [snapshot]);
  const operation = snapshot?.operation ?? null;
  const setSelected = useProjects((s) => s.setSelected);
  const refresh = useGit((s) => s.refresh);
  const [diff, setDiff] = useState<string>('');
  const [active, setActive] = useState<string | null>(conflicted[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActive((prev) => (prev && conflicted.includes(prev) ? prev : conflicted[0] ?? null));
  }, [conflicted]);

  useEffect(() => {
    let cancelled = false;
    if (!active) {
      setDiff('');
      return;
    }
    void runner()
      .git.diff(cwd, active, false)
      .then((d) => {
        if (!cancelled) setDiff(d);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, active]);

  // Nothing interrupted and nothing conflicted → stay out of the way.
  if (conflicted.length === 0 && !operation) return null;

  const run = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh(cwd);
    } catch (err) {
      setError(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const opLabel = operation === 'rebase' ? 'Rebase' : 'Merge';
  const resolved = conflicted.length === 0;

  return (
    <div className="conflict-panel" role="region" aria-label="Merge conflicts">
      {conflicted.length > 0 ? (
        <div className="banner warn">
          <strong>{conflicted.length}</strong> conflicted file{conflicted.length > 1 ? 's' : ''}
          {' — '}resolve markers (`{'<<<<<<<'}`, `{'======='}`, `{'>>>>>>>'}`) then stage each file.
        </div>
      ) : (
        <div className="banner ok">
          All conflicts staged — continue the {opLabel.toLowerCase()} or abort.
        </div>
      )}

      {operation ? (
        <div className="conflict-actions" role="toolbar" aria-label={`${opLabel} actions`}>
          <span className="op-tag">{opLabel} in progress</span>
          <button
            type="button"
            className="primary"
            disabled={busy || !resolved}
            title={resolved ? `Continue ${opLabel}` : 'Resolve & stage all conflicts first'}
            onClick={() => void run('Continue', () => runner().git.continue(cwd))}
          >
            {busy ? '…' : `Continue ${opLabel}`}
          </button>
          <button
            type="button"
            disabled={busy}
            title={`Abort ${opLabel}`}
            onClick={() => {
              if (window.confirm(`Abort the ${opLabel.toLowerCase()} and restore the previous state?`)) {
                void run('Abort', () => runner().git.abort(cwd));
              }
            }}
          >
            Abort
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="banner err" role="alert">
          {error}
        </div>
      ) : null}

      {conflicted.length > 0 ? (
        <ul className="conflict-list" role="listbox">
          {conflicted.map((f) => (
            <li
              key={f}
              role="option"
              aria-selected={f === active}
              className={f === active ? 'active' : ''}
              onClick={() => {
                setActive(f);
                setSelected(cwd, f);
              }}
            >
              ⚠ {f}
            </li>
          ))}
        </ul>
      ) : null}

      {active && conflicted.length > 0 ? (
        <pre className="conflict-diff" aria-label={`Conflict diff for ${active}`}>
          {diff || '(loading)'}
        </pre>
      ) : null}
    </div>
  );
}
