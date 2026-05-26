import { useEffect, useState } from 'react';
import { useProjects } from '../stores/projects';
import { runner } from '../api';
import { DiffViewer } from './DiffViewer';

export function RightSidebar(): JSX.Element {
  const selectedCwd = useProjects((s) => s.selectedCwd);
  const selectedFile = useProjects((s) => s.selectedFile);
  const [diff, setDiff] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    if (!selectedCwd || !selectedFile) {
      setDiff('');
      return;
    }
    void runner()
      .git.diff(selectedCwd, selectedFile, false)
      .then((d) => {
        if (!cancelled) setDiff(d);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCwd, selectedFile]);

  return (
    <aside className="sidebar right" aria-label="Changes">
      <h3>Changes</h3>
      {!selectedFile ? (
        <div style={{ padding: 12, color: 'var(--fg-dim)' }}>
          좌측에서 변경 파일을 선택하세요
        </div>
      ) : (
        <DiffViewer raw={diff} />
      )}
    </aside>
  );
}
