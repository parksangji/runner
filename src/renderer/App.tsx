import { useEffect, useMemo } from 'react';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { Center } from './components/Center';
import { CommitDialog } from './components/CommitDialog';
import { BranchDialog } from './components/BranchDialog';
import { useSessions, bindDaemonEvents } from './stores/sessions';
import { useGit } from './stores/git';
import { useProjects } from './stores/projects';
import { useLayoutPrefs } from './stores/layout';
import { useGlobalHotkeys } from './hooks/useHotkeys';
import { runner } from './api';

export function App(): JSX.Element {
  const hydrate = useSessions((s) => s.hydrate);
  const focusedSession = useSessions((s) =>
    s.focusedId ? s.sessions[s.focusedId] ?? null : null
  );
  const refreshGit = useGit((s) => s.refresh);
  const recompute = useProjects((s) => s.recompute);
  const loadPinned = useProjects((s) => s.loadPinned);
  const projects = useProjects((s) => s.projects);
  const sessionsMap = useSessions((s) => s.sessions);
  const loadPrefs = useLayoutPrefs((s) => s.loadPrefs);
  const leftOpen = useLayoutPrefs((s) => s.leftOpen);
  const rightOpen = useLayoutPrefs((s) => s.rightOpen);

  // Bootstrap: load persisted prefs/pins first, then attach to daemon sessions.
  useEffect(() => {
    let off: (() => void) | null = null;
    (async () => {
      await Promise.all([loadPrefs(), loadPinned()]);
      await hydrate();
      off = bindDaemonEvents();
    })();
    return () => {
      off?.();
    };
  }, [loadPrefs, loadPinned, hydrate]);

  // Refresh git status whenever focused session's cwd changes.
  useEffect(() => {
    if (focusedSession) void refreshGit(focusedSession.cwd);
  }, [focusedSession, refreshGit]);

  // Rebuild project list whenever sessions change.
  useEffect(() => {
    recompute(Object.values(sessionsMap));
  }, [sessionsMap, recompute]);

  // Watch every known project's cwd for filesystem changes, refresh git when fired.
  useEffect(() => {
    const cwds = Object.keys(projects);
    cwds.forEach((cwd) => void runner().fs.watch(cwd));
    const off = runner().fs.onChanged((root) => {
      void refreshGit(root);
    });
    return () => {
      off();
      cwds.forEach((cwd) => void runner().fs.unwatch(cwd));
    };
  }, [projects, refreshGit]);

  useGlobalHotkeys();

  const bodyStyle = useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: `${leftOpen ? '240px' : '0px'} 1fr ${rightOpen ? '360px' : '0px'}`,
      transition: 'grid-template-columns 120ms ease',
    }),
    [leftOpen, rightOpen]
  );

  return (
    <div className="app">
      <TopBar />
      <div className="body" style={bodyStyle}>
        {leftOpen ? <LeftSidebar /> : <div />}
        <Center />
        {rightOpen ? <RightSidebar /> : <div />}
      </div>
      <CommitDialog />
      <BranchDialog />
    </div>
  );
}
