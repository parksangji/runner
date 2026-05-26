import { useEffect, useMemo } from 'react';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { Center } from './components/Center';
import { useSessions, bindDaemonEvents } from './stores/sessions';
import { useGit } from './stores/git';
import { useProjects } from './stores/projects';
import { useLayoutPrefs } from './stores/layout';
import { useGlobalHotkeys } from './hooks/useHotkeys';

export function App(): JSX.Element {
  const hydrate = useSessions((s) => s.hydrate);
  const focusedSession = useSessions((s) =>
    s.focusedId ? s.sessions[s.focusedId] ?? null : null
  );
  const refreshGit = useGit((s) => s.refresh);
  const recompute = useProjects((s) => s.recompute);
  const sessionsMap = useSessions((s) => s.sessions);
  const { leftOpen, rightOpen } = useLayoutPrefs((s) => ({
    leftOpen: s.leftOpen,
    rightOpen: s.rightOpen,
  }));

  useEffect(() => {
    void hydrate();
    const off = bindDaemonEvents();
    return off;
  }, [hydrate]);

  useEffect(() => {
    if (focusedSession) void refreshGit(focusedSession.cwd);
  }, [focusedSession, refreshGit]);

  useEffect(() => {
    recompute(Object.values(sessionsMap));
  }, [sessionsMap, recompute]);

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
    </div>
  );
}
