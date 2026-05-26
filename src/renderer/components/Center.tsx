import { useEffect, useRef } from 'react';
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react';
import { useDockview } from '../stores/dockview';
import { useSessions } from '../stores/sessions';
import { useLayoutDock } from '../stores/layout';
import { TerminalView } from './TerminalView';

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

export function Center(): JSX.Element {
  const setApi = useDockview((s) => s.setApi);
  const sessions = useSessions((s) => s.sessions);
  const hydratedRef = useRef(false);

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

  useEffect(() => {
    const api = useDockview.getState().api;
    if (!api) return;
    const known = new Set(Object.keys(sessions));

    if (!hydratedRef.current) {
      // First sync: panels that survived from a restored layout need their
      // session-id to still exist; otherwise drop them. Then add panels for
      // any daemon-restored sessions that the layout didn't already include.
      for (const p of api.panels) {
        if (!known.has(p.id)) {
          try {
            api.removePanel(p);
          } catch {
            /* ignore */
          }
        }
      }
      for (const id of known) {
        if (!api.getPanel(id)) {
          const s = sessions[id]!;
          try {
            api.addPanel({
              id,
              component: 'terminal',
              params: { sessionId: id, cwd: s.cwd },
              title: s.cwd.split('/').slice(-2).join('/') || s.cwd,
            });
          } catch (err) {
            console.error('hydrate panel failed', err);
          }
        }
      }
      hydratedRef.current = true;
      return;
    }

    // Steady state: drop panels whose session is gone.
    for (const p of api.panels) {
      if (!known.has(p.id)) {
        try {
          api.removePanel(p);
        } catch {
          /* ignore */
        }
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
