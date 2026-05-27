import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { ChangesPanel } from './components/ChangesPanel';
import { Center } from './components/Center';
import { CommitDialog } from './components/CommitDialog';
import { BranchDialog } from './components/BranchDialog';
import { LogDialog } from './components/LogDialog';
import { CommandPalette } from './components/CommandPalette';
import { SettingsDialog } from './components/SettingsDialog';
import { Toasts } from './components/Toasts';
import { useTheme } from './stores/theme';
import { useSettings } from './stores/settings';
import { useSessions, bindDaemonEvents } from './stores/sessions';
import { bindConnectionStatus } from './stores/connection';
import { useGit } from './stores/git';
import { useProjects } from './stores/projects';
import { useLayoutPrefs } from './stores/layout';
import { useGlobalHotkeys } from './hooks/useHotkeys';
import { useToasts } from './stores/toast';
import { runner } from './api';

export function App(): JSX.Element {
  const hydrate = useSessions((s) => s.hydrate);
  const reconcile = useSessions((s) => s.reconcile);
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
  const leftWidth = useLayoutPrefs((s) => s.leftWidth);
  const setLeftWidth = useLayoutPrefs((s) => s.setLeftWidth);
  const initTheme = useTheme((s) => s.init);
  const initSettings = useSettings((s) => s.init);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    initTheme();
    initSettings();
  }, [initTheme, initSettings]);

  // Bootstrap: load persisted prefs/pins first, then attach to daemon sessions.
  useEffect(() => {
    let off: (() => void) | null = null;
    const offStatus = bindConnectionStatus();
    (async () => {
      await Promise.all([loadPrefs(), loadPinned()]);
      await hydrate();
      off = bindDaemonEvents();
    })();
    return () => {
      off?.();
      offStatus();
    };
  }, [loadPrefs, loadPinned, hydrate]);

  // Safety net: re-sync session state (notably cwd) from the daemon on an
  // interval. Live `cwd` events are the fast path; this guarantees the UI
  // converges even if an event is dropped, so a terminal that cd's into a git
  // repo reliably surfaces in the Changes panel.
  useEffect(() => {
    const t = setInterval(() => void reconcile(), 2000);
    return () => clearInterval(t);
  }, [reconcile]);

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

  // Update notifications: a newer release becomes a sticky toast with a
  // Download button; a manual "you're up to date" check is a transient info.
  useEffect(() => {
    const push = useToasts.getState().push;
    const offAvail = runner().update.onAvailable((info) => {
      push('info', `New version ${info.version} is available.`, {
        sticky: true,
        action: { label: 'Download', run: () => void runner().update.open(info.url) },
      });
    });
    const offNone = runner().update.onUpToDate(({ version }) => {
      push('success', `You're on the latest version (${version}).`);
    });
    return () => {
      offAvail();
      offNone();
    };
  }, []);

  useGlobalHotkeys();

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      const onMove = (ev: MouseEvent): void => setLeftWidth(ev.clientX);
      const onUp = (): void => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        setDragging(false);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [setLeftWidth]
  );

  const bodyStyle = useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: leftOpen ? `${leftWidth}px 5px 1fr` : '0px 0px 1fr',
      transition: dragging ? 'none' : 'grid-template-columns 120ms ease',
    }),
    [leftOpen, leftWidth, dragging]
  );

  return (
    <div className="app">
      <TopBar />
      <div className="body" style={bodyStyle}>
        {leftOpen ? <ChangesPanel /> : <div />}
        {leftOpen ? (
          <div
            className="resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize changes panel"
            onMouseDown={startResize}
          />
        ) : (
          <div />
        )}
        <Center />
      </div>
      <CommitDialog />
      <BranchDialog />
      <LogDialog />
      <CommandPalette />
      <SettingsDialog />
      <Toasts />
    </div>
  );
}
