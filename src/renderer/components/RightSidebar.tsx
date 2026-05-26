import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjects } from '../stores/projects';
import { useGit } from '../stores/git';
import { useSessions } from '../stores/sessions';
import { runner } from '../api';
import { DiffViewer } from './DiffViewer';
import { ConflictPanel } from './ConflictPanel';
import type { SelectionLine } from '@main/ipc/stage-hunks';

export function RightSidebar(): JSX.Element {
  const selectedCwd = useProjects((s) => s.selectedCwd);
  const selectedFile = useProjects((s) => s.selectedFile);
  const refresh = useGit((s) => s.refresh);
  const focusedCwd = useSessions((s) =>
    s.focusedId ? s.sessions[s.focusedId]?.cwd ?? null : null
  );
  const snap = useGit((s) => {
    const cwd = selectedCwd ?? focusedCwd;
    if (!cwd) return null;
    return (
      Object.values(s.snapshots).find((sn) => sn.repoRoot && cwd.startsWith(sn.repoRoot)) ?? null
    );
  });
  const conflictCwd = snap?.repoRoot ?? selectedCwd ?? focusedCwd ?? '';
  const [diff, setDiff] = useState<string>('');
  const [staged, setStaged] = useState<boolean>(false);
  const [selection, setSelection] = useState<SelectionLine[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadDiff = useCallback(async () => {
    if (!selectedCwd || !selectedFile) {
      setDiff('');
      return;
    }
    try {
      const d = await runner().git.diff(selectedCwd, selectedFile, staged);
      setDiff(d);
    } catch (err) {
      console.error('diff failed', err);
      setDiff('');
    }
  }, [selectedCwd, selectedFile, staged]);

  useEffect(() => {
    void loadDiff();
  }, [loadDiff]);

  const resetKey = useMemo(
    () => `${selectedCwd ?? ''}::${selectedFile ?? ''}::${staged ? 'staged' : 'unstaged'}`,
    [selectedCwd, selectedFile, staged]
  );

  const apply = async (unstage: boolean): Promise<void> => {
    if (!selectedCwd || !selectedFile || selection.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runner().git.stageHunks({
        cwd: selectedCwd,
        file: selectedFile,
        rawDiff: diff,
        selection,
        unstage,
      });
      if (!result.ok) {
        setError(result.error ?? 'patch apply failed');
        return;
      }
      await refresh(selectedCwd);
      await loadDiff();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const stageWholeFile = async (): Promise<void> => {
    if (!selectedCwd || !selectedFile) return;
    setBusy(true);
    setError(null);
    try {
      if (staged) {
        await runner().git.unstage(selectedCwd, [selectedFile]);
      } else {
        await runner().git.stage(selectedCwd, [selectedFile]);
      }
      await refresh(selectedCwd);
      await loadDiff();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="sidebar right" aria-label="Changes">
      <div className="right-header">
        <h3 style={{ margin: 0 }}>Changes</h3>
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
      <ConflictPanel snapshot={snap} cwd={conflictCwd} />
      {!selectedFile ? (
        <div style={{ padding: 12, color: 'var(--fg-dim)' }}>
          좌측에서 변경 파일을 선택하세요
        </div>
      ) : (
        <>
          <div className="stage-actions" role="toolbar" aria-label="Stage actions">
            <button
              type="button"
              disabled={busy || selection.length === 0}
              onClick={() => void apply(staged /* unstage if we are looking at the staged side */)}
              title={staged ? 'Unstage selected lines' : 'Stage selected lines'}
            >
              {staged ? '↶ Unstage selected' : '+ Stage selected'} ({selection.length})
            </button>
            <button type="button" disabled={busy} onClick={() => void stageWholeFile()}>
              {staged ? 'Unstage file' : 'Stage file'}
            </button>
          </div>
          {error ? (
            <div className="banner err" role="alert">
              {error}
            </div>
          ) : null}
          <DiffViewer raw={diff} onSelectionChange={setSelection} resetKey={resetKey} />
        </>
      )}
    </aside>
  );
}
