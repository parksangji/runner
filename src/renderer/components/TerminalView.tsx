import { useEffect, useRef } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { runner } from '../api';
import { useTheme } from '../stores/theme';

interface Props {
  sessionId: string;
}

function readThemeFromCss(): ITheme {
  const root = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string): string => {
    const v = root.getPropertyValue(name).trim();
    return v || fallback;
  };
  return {
    background: get('--bg', '#0f1117'),
    foreground: get('--fg', '#d6dbe5'),
    cursor: get('--accent', '#6aa7ff'),
    cursorAccent: get('--bg', '#0f1117'),
    selectionBackground: get('--accent-soft', 'rgba(106,167,255,0.25)'),
  };
}

export function TerminalView({ sessionId }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const disposedRef = useRef<boolean>(false);
  const initialThemeRender = useRef<boolean>(true);
  const resolvedTheme = useTheme((s) => s.resolved);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    disposedRef.current = false;
    initialThemeRender.current = true;

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      theme: readThemeFromCss(),
      scrollback: 5000,
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    // Canonical xterm pattern: fit immediately after open. The error
    // suppression in main.tsx covers any post-dispose stragglers from
    // xterm's internal scheduler.
    try {
      fit.fit();
    } catch {
      /* host not laid out yet; ResizeObserver below will retry */
    }
    termRef.current = term;
    fitRef.current = fit;

    const isAlive = (): boolean => !disposedRef.current && termRef.current === term;

    const isMac = navigator.platform.toLowerCase().includes('mac');
    const isAppShortcut = (e: KeyboardEvent): boolean => {
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      if (!cmd) return false;
      const k = e.key.toLowerCase();
      if (k === 't' || k === 'w' || k === 'd' || k === 'b') return true;
      if (k === 'enter' || k === 'return') return true;
      if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') return true;
      return false;
    };
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === 'Backspace' && cmd && !e.shiftKey && !e.altKey) {
        runner().daemon.write(sessionId, '\x15');
        e.preventDefault();
        return false;
      }
      if (e.key === 'Backspace' && e.altKey && !cmd) {
        runner().daemon.write(sessionId, '\x17');
        e.preventDefault();
        return false;
      }
      if (isAppShortcut(e)) return false;
      return true;
    });

    let pendingResize = false;
    const onResize = (): void => {
      if (pendingResize || !isAlive()) return;
      pendingResize = true;
      requestAnimationFrame(() => {
        pendingResize = false;
        if (!isAlive() || !host.isConnected) return;
        const rect = host.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) return;
        try {
          fit.fit();
          runner().daemon.resize(sessionId, term.cols, term.rows);
        } catch (err) {
          console.warn('resize fit failed', err);
        }
      });
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    const offEvent = runner().daemon.onEvent((evt) => {
      if (!isAlive()) return;
      if (evt.kind !== 'data' || evt.id !== sessionId) return;
      try {
        term.write(evt.data);
      } catch {
        /* ignore — late event during teardown */
      }
    });

    const onInput = term.onData((data) => {
      if (!isAlive()) return;
      runner().daemon.write(sessionId, data);
    });

    void runner()
      .daemon.request<{ summary: unknown; scrollback: string }>({
        kind: 'attach',
        id: sessionId,
      })
      .then((res) => {
        if (!isAlive()) return;
        if (res?.scrollback) {
          try {
            term.write(res.scrollback);
          } catch {
            /* ignore */
          }
        }
        try {
          term.focus();
        } catch {
          /* ignore */
        }
      })
      .catch((err) => console.error('attach failed', err));

    const onPaneDown = (): void => {
      if (isAlive()) {
        try {
          term.focus();
        } catch {
          /* ignore */
        }
      }
    };
    host.addEventListener('mousedown', onPaneDown);

    return () => {
      disposedRef.current = true;
      host.removeEventListener('mousedown', onPaneDown);
      ro.disconnect();
      offEvent();
      try {
        onInput.dispose();
      } catch {
        /* ignore */
      }
      try {
        fit.dispose();
      } catch {
        /* ignore */
      }
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
      if (termRef.current === term) termRef.current = null;
      if (fitRef.current === fit) fitRef.current = null;
      void runner().daemon.request({ kind: 'detach', id: sessionId });
    };
  }, [sessionId]);

  // Theme re-application: skip the first run (the constructor already
  // applied the current theme; re-applying it inside React's commit
  // phase races xterm's internal init and was a primary trigger of
  // the Viewport.syncScrollArea dimensions throw).
  useEffect(() => {
    if (initialThemeRender.current) {
      initialThemeRender.current = false;
      return;
    }
    const term = termRef.current;
    if (!term || disposedRef.current) return;
    try {
      term.options.theme = readThemeFromCss();
    } catch (err) {
      console.warn('retheme failed', err);
    }
  }, [resolvedTheme]);

  return <div ref={hostRef} className="xterm-host" tabIndex={-1} />;
}
