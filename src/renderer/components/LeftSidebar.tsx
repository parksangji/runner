import { useEffect, useMemo } from 'react';
import { useSessions } from '../stores/sessions';
import { useGit } from '../stores/git';
import { useProjects } from '../stores/projects';

export function LeftSidebar(): JSX.Element {
  const focused = useSessions((s) => (s.focusedId ? s.sessions[s.focusedId] : null));
  const projects = useProjects((s) => s.projects);
  const selectedCwd = useProjects((s) => s.selectedCwd);
  const selectedFile = useProjects((s) => s.selectedFile);
  const setSelected = useProjects((s) => s.setSelected);
  const togglePin = useProjects((s) => s.togglePin);
  const snapshots = useGit((s) => s.snapshots);
  const refresh = useGit((s) => s.refresh);

  const activeCwd = selectedCwd ?? focused?.cwd ?? null;

  const items = useMemo(() => {
    const list = Object.values(projects);
    list.sort((a, b) => (a.pinned === b.pinned ? a.label.localeCompare(b.label) : a.pinned ? -1 : 1));
    return list;
  }, [projects]);

  useEffect(() => {
    for (const p of items) void refresh(p.cwd);
  }, [items, refresh]);

  return (
    <aside className="sidebar left" aria-label="Projects">
      <h3>Projects</h3>
      {items.length === 0 ? (
        <div className="empty" style={{ padding: 12, color: 'var(--fg-dim)' }}>
          새 터미널을 열면 자동으로 추가됩니다 (⌘T)
        </div>
      ) : null}
      {items.map((p) => {
        const snap = Object.values(snapshots).find(
          (sn) => sn.repoRoot && p.cwd.startsWith(sn.repoRoot)
        );
        const files = snap?.status
          ? [
              ...snap.status.modified.map((f) => ({ path: f, kind: 'M' as const })),
              ...snap.status.created.map((f) => ({ path: f, kind: 'A' as const })),
              ...snap.status.deleted.map((f) => ({ path: f, kind: 'D' as const })),
              ...snap.status.not_added.map((f) => ({ path: f, kind: '?' as const })),
              ...snap.status.conflicted.map((f) => ({ path: f, kind: '!' as const })),
            ]
          : [];
        const isActive = activeCwd === p.cwd;
        return (
          <div key={p.cwd}>
            <div
              className={`project${isActive ? ' active' : ''}`}
              onClick={() => setSelected(p.cwd, null)}
              onContextMenu={(e) => {
                e.preventDefault();
                togglePin(p.cwd);
              }}
              role="button"
              tabIndex={0}
            >
              <span>{p.pinned ? '📌 ' : ''}</span>
              {p.label}
              <span style={{ color: 'var(--fg-dim)', marginLeft: 6, fontSize: 11 }}>
                {p.sessionIds.length || ''}
              </span>
            </div>
            {isActive
              ? files.map((f) => (
                  <div
                    key={f.path}
                    className={`changed-file${selectedFile === f.path ? ' selected' : ''}`}
                    onClick={() => setSelected(p.cwd, f.path)}
                    role="button"
                    tabIndex={0}
                  >
                    <span className={`status ${f.kind}`}>{f.kind}</span>
                    <span>{f.path}</span>
                  </div>
                ))
              : null}
          </div>
        );
      })}
    </aside>
  );
}
