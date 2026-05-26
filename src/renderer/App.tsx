import { useEffect, useMemo, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { Center } from './components/Center';
import { CommitDialog } from './components/CommitDialog';
import { BranchDialog } from './components/BranchDialog';
import { CommandPalette } from './components/CommandPalette';
import { useTheme } from './stores/theme';
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
  const initTheme = useTheme((s) => s.init);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

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

  // Watch every known project's cwd for filesystem changes. Track watched
  // paths in a ref so changing the project list only diffs (start new ones,
  // stop removed ones) — avoids tearing down chokidar watchers every
  // session-list update.
  const watchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set(Object.keys(projects));
    for (const cwd of next) {
      if (!watchedRef.current.has(cwd)) {
        void runner().fs.watch(cwd);
        watchedRef.current.add(cwd);
      }
    }
    for (const cwd of watchedRef.current) {
      if (!next.has(cwd)) {
        void runner().fs.unwatch(cwd);
        watchedRef.current.delete(cwd);
      }
    }
  }, [projects]);

  useEffect(() => {
    const off = runner().fs.onChanged((root) => {
      void refreshGit(root);
    });
    return () => off();
  }, [refreshGit]);

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
      <CommandPalette />
    </div>
  );
}
