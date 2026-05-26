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
  const disposedRef = useRef<boolean>(false);
  const resolvedTheme = useTheme((s) => s.resolved);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    disposedRef.current = false;
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
    termRef.current = term;

    // Guarded wrappers: after term.dispose() xterm internals (Viewport,
    // RenderService, etc.) tear down but any late callback — RAF tick,
    // ResizeObserver microtask, in-flight attach promise, a queued data
    // event — could still try to read renderService.dimensions and crash.
    // Centralize the "is this term still alive?" check.
    const isAlive = (): boolean => !disposedRef.current && termRef.current === term;
    const safeWrite = (data: string): void => {
      if (!isAlive()) return;
      try {
        term.write(data);
      } catch (err) {
        console.warn('term.write after dispose', err);
      }
    };

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

    let pendingFit = false;
    const safeFit = (): void => {
      if (pendingFit) return;
      pendingFit = true;
      requestAnimationFrame(() => {
        pendingFit = false;
        if (!isAlive()) return;
        if (!host.isConnected) return;
        const rect = host.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) return;
        try {
          fit.fit();
          runner().daemon.resize(sessionId, term.cols, term.rows);
        } catch (err) {
          console.warn('fit failed', err);
        }
      });
    };

    safeFit();
    const ro = new ResizeObserver(safeFit);
    ro.observe(host);

    const offEvent = runner().daemon.onEvent((evt) => {
      if (evt.kind !== 'data' || evt.id !== sessionId) return;
      safeWrite(evt.data);
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
        if (res?.scrollback) safeWrite(res.scrollback);
        try {
          term.focus();
        } catch {
          /* disposed during await */
        }
      })
      .catch((err) => console.error('attach failed', err));

    const onPaneDown = (): void => {
      if (isAlive()) term.focus();
    };
    host.addEventListener('mousedown', onPaneDown);

    return () => {
      disposedRef.current = true;
      host.removeEventListener('mousedown', onPaneDown);
      ro.disconnect();
      offEvent();
      onInput.dispose();
      try {
        term.dispose();
      } catch {
        /* ignore double-dispose */
      }
      if (termRef.current === term) termRef.current = null;
      void runner().daemon.request({ kind: 'detach', id: sessionId });
    };
  }, [sessionId]);

  // Re-theme xterm when the resolved theme changes — but only if the
  // terminal hasn't been disposed in between.
  useEffect(() => {
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
