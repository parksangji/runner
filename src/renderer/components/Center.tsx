import { useEffect, useRef } from 'react';
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react';
import { useDockview } from '../stores/dockview';
import { useSessions } from '../stores/sessions';
import { TerminalView } from './TerminalView';

function TerminalPanel(props: IDockviewPanelProps<{ sessionId: string; cwd: string }>): JSX.Element {
  const { sessionId } = props.params;
  return (
    <div
      className="terminal-pane"
      onMouseDown={() => useSessions.getState().setFocus(sessionId)}
    >
      <TerminalView sessionId={sessionId} />
    </div>
  );
}

const components = {
  terminal: TerminalPanel,
};

export function Center(): JSX.Element {
  const setApi = useDockview((s) => s.setApi);
  const sessions = useSessions((s) => s.sessions);
  // Sessions we have already placed into dockview. Owned by Center.
  // createTerminal owns the placement of NEW sessions (so it can pick
  // a split direction); this set lets the cleanup pass forget about
  // those automatically. Initial hydration uses this to restore panels
  // for daemon-survived sessions exactly once.
  const placedRef = useRef<Set<string>>(new Set());
  const hydratedRef = useRef(false);

  const onReady = (event: DockviewReadyEvent): void => {
    setApi(event.api);
    event.api.onDidActivePanelChange((panel) => {
      if (panel) useSessions.getState().setFocus(panel.id);
    });
  };

  useEffect(() => {
    const api = useDockview.getState().api;
    if (!api) return;
    const known = new Set(Object.keys(sessions));

    // One-shot: restore panels for sessions that were already running in the
    // daemon when the renderer started. After this, panel creation is the
    // sole responsibility of useDockview.createTerminal().
    if (!hydratedRef.current) {
      for (const id of known) {
        if (api.getPanel(id)) {
          placedRef.current.add(id);
          continue;
        }
        const s = sessions[id]!;
        try {
          api.addPanel({
            id,
            component: 'terminal',
            params: { sessionId: id, cwd: s.cwd },
            title: s.cwd.split('/').slice(-2).join('/') || s.cwd,
          });
          placedRef.current.add(id);
        } catch (err) {
          console.error('hydrate panel failed', err);
        }
      }
      hydratedRef.current = true;
    } else {
      // Track newly added panels (created by createTerminal) so cleanup
      // doesn't accidentally remove them.
      for (const id of known) {
        if (api.getPanel(id)) placedRef.current.add(id);
      }
    }

    // Cleanup: remove panels whose backing session is gone.
    for (const p of api.panels) {
      if (!known.has(p.id)) {
        try {
          api.removePanel(p);
        } catch {
          /* ignore */
        }
        placedRef.current.delete(p.id);
      }
    }
  }, [sessions]);

  return (
    <div className="center">
      <div className="dock-host">
        <DockviewReact onReady={onReady} components={components} className="dockview-theme-abyss" />
      </div>
    </div>
  );
}
