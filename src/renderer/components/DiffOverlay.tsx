import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjects } from '../stores/projects';
import { useGit } from '../stores/git';
import { runner } from '../api';
import { DiffViewer } from './DiffViewer';
import type { SelectionLine } from '@main/ipc/stage-hunks';

/** Full-bleed diff view that floats over the terminal area. Opened by clicking
 *  a changed file in the Changes panel; clicking the same file again (or the
 *  close button) dismisses it. Shows just that file's diff, concisely. */
export function DiffOverlay(): JSX.Element | null {
  const selectedCwd = useProjects((s) => s.selectedCwd);
  const selectedFile = useProjects((s) => s.selectedFile);
  const staged = useProjects((s) => s.staged);
  const setSelected = useProjects((s) => s.setSelected);
  const refresh = useGit((s) => s.refresh);

  const [diff, setDiff] = useState('');
  const [selection, setSelection] = useState<SelectionLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedCwd || !selectedFile) {
      setDiff('');
      return;
    }
    try {
      setDiff(await runner().git.diff(selectedCwd, selectedFile, staged));
    } catch (err) {
      console.error('diff failed', err);
      setDiff('');
    }
  }, [selectedCwd, selectedFile, staged]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetKey = useMemo(
    () => `${selectedCwd ?? ''}::${selectedFile ?? ''}::${staged ? 'staged' : 'unstaged'}`,
    [selectedCwd, selectedFile, staged]
  );

  if (!selectedCwd || !selectedFile) return null;

  const close = (): void => setSelected(selectedCwd, null);

  const applyHunks = async (): Promise<void> => {
    if (selection.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runner().git.stageHunks({
        cwd: selectedCwd,
        file: selectedFile,
        rawDiff: diff,
        selection,
        unstage: staged,
      });
      if (!result.ok) {
        setError(result.error ?? 'patch apply failed');
        return;
      }
      await refresh(selectedCwd);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const stageWholeFile = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (staged) await runner().git.unstage(selectedCwd, [selectedFile]);
      else await runner().git.stage(selectedCwd, [selectedFile]);
      await refresh(selectedCwd);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="diff-overlay" role="region" aria-label={`Diff for ${selectedFile}`}>
      <div className="diff-overlay-header">
        <span className="diff-file" title={selectedFile}>
          {selectedFile}
        </span>
        <span className="diff-mode">{staged ? 'Staged' : 'Working'}</span>
        <div className="diff-actions">
          <button
            type="button"
            disabled={busy || selection.length === 0}
            onClick={() => void applyHunks()}
            title={staged ? 'Unstage selected lines' : 'Stage selected lines'}
          >
            {staged ? '↶ Unstage' : '+ Stage'} ({selection.length})
          </button>
          <button type="button" disabled={busy} onClick={() => void stageWholeFile()}>
            {staged ? 'Unstage file' : 'Stage file'}
          </button>
          <button type="button" className="diff-close" aria-label="Close diff" title="닫기" onClick={close}>
            ✕
          </button>
        </div>
      </div>
      {error ? (
        <div className="banner err" role="alert">
          {error}
        </div>
      ) : null}
      <div className="diff-overlay-body">
        <DiffViewer raw={diff} onSelectionChange={setSelection} resetKey={resetKey} />
      </div>
    </div>
  );
}
