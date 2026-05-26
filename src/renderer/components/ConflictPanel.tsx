import { useEffect, useState } from 'react';
import type { GitSnapshot } from '@main/ipc/git';
import { useProjects } from '../stores/projects';
import { runner } from '../api';

interface Props {
  snapshot: GitSnapshot | null;
  cwd: string;
}

export function ConflictPanel({ snapshot, cwd }: Props): JSX.Element | null {
  const conflicted = snapshot?.status?.conflicted ?? [];
  const setSelected = useProjects((s) => s.setSelected);
  const [diff, setDiff] = useState<string>('');
  const [active, setActive] = useState<string | null>(conflicted[0] ?? null);

  useEffect(() => {
    setActive(conflicted[0] ?? null);
  }, [snapshot]);

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

  if (conflicted.length === 0) return null;

  return (
    <div className="conflict-panel" role="region" aria-label="Merge conflicts">
      <div className="banner warn">
        <strong>{conflicted.length}</strong> conflicted file{conflicted.length > 1 ? 's' : ''}
        {' — '}resolve markers (`{'<<<<<<<'}`, `{'======='}`, `{'>>>>>>>'}`) then stage to continue.
      </div>
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
      {active ? (
        <pre className="conflict-diff" aria-label={`Conflict diff for ${active}`}>
          {diff || '(loading)'}
        </pre>
      ) : null}
    </div>
  );
}
