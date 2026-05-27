import { useEffect } from 'react';
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react';
import { useDockview } from '../stores/dockview';
import { useSessions } from '../stores/sessions';
import { useLayoutDock } from '../stores/layout';
import { useTheme } from '../stores/theme';
import { TerminalView } from './TerminalView';
import { DiffOverlay } from './DiffOverlay';

function focusXtermIn(root: HTMLElement | null): void {
  if (!root) return;
  const ta = root.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
  ta?.focus();
}

function TerminalPanel(props: IDockviewPanelProps<{ sessionId: string; cwd: string }>): JSX.Element {
  const { sessionId } = props.params;
  return (
    <div
      className="terminal-pane"
      onMouseDown={(e) => {
        useSessions.getState().setFocus(sessionId);
        // Any click within the pane (including on a non-xterm child) should
        // park keyboard focus on this terminal's textarea so typing works.
        focusXtermIn(e.currentTarget);
      }}
    >
      <TerminalView sessionId={sessionId} />
    </div>
  );
}

const components = {
  terminal: TerminalPanel,
};

const isMac = navigator.platform.toLowerCase().includes('mac');
const mod = isMac ? '⌘' : 'Ctrl';
const shift = isMac ? '⇧' : 'Shift';

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: `${mod}T`, label: 'New terminal' },
  { keys: `${mod}D`, label: 'Split right' },
  { keys: `${mod}${shift}D`, label: 'Split down' },
  { keys: `${mod}W`, label: 'Close terminal' },
  { keys: `${mod}B`, label: 'Toggle Changes panel' },
  { keys: `${mod}K`, label: 'Command palette' },
];

function Welcome(): JSX.Element {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>runner</h1>
        <p className="welcome-sub">Claude Code workbench — multi-terminal + git</p>
        <button
          type="button"
          className="welcome-cta"
          onClick={() => void useDockview.getState().createTerminal()}
        >
          {mod}T &nbsp;Open a new terminal
        </button>
        <ul className="welcome-keys">
          {SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Center(): JSX.Element {
  const setApi = useDockview((s) => s.setApi);
  const sessions = useSessions((s) => s.sessions);
  const resolved = useTheme((s) => s.resolved);
  // Follow the app theme so the tab strip matches the rest of the UI
  // (light = white tabs) instead of the hard-coded dark abyss theme.
  const dockTheme = resolved === 'dark' ? 'dockview-theme-dark' : 'dockview-theme-light';

  const onReady = (event: DockviewReadyEvent): void => {
    setApi(event.api);

    // Restore prior dockview layout, if any. Panels in the layout that no
    // longer have a backing session will be culled by the hydration effect.
    const saved = useLayoutDock.getState().lastSerialized;
    if (saved && !useLayoutDock.getState().restored) {
      try {
        event.api.fromJSON(saved as never);
      } catch (err) {
        console.warn('layout restore failed, starting fresh', err);
      }
      useLayoutDock.getState().markRestored();
    }

    event.api.onDidActivePanelChange((panel) => {
      if (!panel) return;
      useSessions.getState().setFocus(panel.id);
      // dockview parks DOM focus on the tab button after switching panels;
      // explicitly pull keyboard focus down into the new panel's xterm
      // textarea on the next frame, after dockview has finished its swap.
      requestAnimationFrame(() => {
        const groupEl = (panel as unknown as { group?: { element?: HTMLElement } }).group?.element;
        focusXtermIn(groupEl ?? null);
      });
    });

    event.api.onDidLayoutChange(() => {
      try {
        const data = event.api.toJSON();
        useLayoutDock.getState().setSerialized(data);
      } catch (err) {
        console.error('serialize layout failed', err);
      }
    });
  };

  // Keep dockview panels in 1:1 sync with the session store at all times — not
  // just on first hydration. A session can appear *after* mount (daemon restore
  // landing late, or the periodic reconcile pulling it in); without adding a
  // panel here those sessions would exist with no visible terminal, which made
  // the Changes panel show repos for terminals you couldn't see.
  useEffect(() => {
    const api = useDockview.getState().api;
    if (!api) return;
    const known = new Set(Object.keys(sessions));

    // Drop panels whose session is gone.
    for (const p of api.panels) {
      if (!known.has(p.id)) {
        try {
          api.removePanel(p);
        } catch {
          /* ignore */
        }
      }
    }

    // Add panels for sessions that don't have one yet, and keep titles synced
    // to each session's (possibly changed) cwd.
    for (const [id, s] of Object.entries(sessions)) {
      const title = s.cwd.split('/').slice(-2).join('/') || s.cwd;
      const panel = api.getPanel(id);
      if (!panel) {
        try {
          api.addPanel({
            id,
            component: 'terminal',
            params: { sessionId: id, cwd: s.cwd },
            title,
          });
        } catch (err) {
          console.error('add panel failed', err);
        }
      } else if (panel.title !== title) {
        panel.api.setTitle(title);
      }
    }
  }, [sessions]);

  const empty = Object.keys(sessions).length === 0;

  return (
    <div className="center">
      <div className="dock-host">
        <DockviewReact onReady={onReady} components={components} className={dockTheme} />
      </div>
      <DiffOverlay />
      {empty ? <Welcome /> : null}
    </div>
  );
}
