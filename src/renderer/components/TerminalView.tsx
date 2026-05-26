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
  const resolvedTheme = useTheme((s) => s.resolved);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
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

    // Two responsibilities:
    //   1. Translate Mac text-field shortcuts into shell control bytes
    //      (⌘⌫ → ^U, ⌥⌫ → ^W) and send directly to the PTY.
    //   2. For ANY app-level ⌘/Cmd shortcut, return false so xterm doesn't
    //      send those keys to the PTY. Without this, xterm calls
    //      cancel(e, true) on some keys (notably Enter), which
    //      stopPropagation()s the event and prevents react-hotkeys-hook
    //      from ever seeing it. Returning false from this handler skips
    //      xterm's processing entirely, letting the event bubble.
    const isMac = navigator.platform.toLowerCase().includes('mac');
    const isAppShortcut = (e: KeyboardEvent): boolean => {
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      if (!cmd) return false;
      const k = e.key.toLowerCase();
      // every combo we register globally — keep this list in sync with useHotkeys.ts
      if (k === 't' || k === 'w' || k === 'd' || k === 'b') return true;
      if (k === 'enter' || k === 'return') return true;
      if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') return true;
      return false;
    };
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      // Shell control byte translations
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
      // Let app-level shortcuts bubble to react-hotkeys-hook on document
      if (isAppShortcut(e)) return false;
      return true;
    });

    let pendingFit = false;
    const safeFit = (): void => {
      if (pendingFit) return;
      pendingFit = true;
      requestAnimationFrame(() => {
        pendingFit = false;
        const rect = host.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) return;
        try {
          fit.fit();
          runner().daemon.resize(sessionId, term.cols, term.rows);
        } catch (err) {
          console.error('fit failed', err);
        }
      });
    };

    safeFit();
    const ro = new ResizeObserver(safeFit);
    ro.observe(host);

    // Subscribe to live data BEFORE attach. The daemon forks the PTY at
    // attach time (not at spawn time), so the prompt cannot arrive until
    // after this listener exists.
    const offEvent = runner().daemon.onEvent((evt) => {
      if (evt.kind !== 'data' || evt.id !== sessionId) return;
      term.write(evt.data);
    });

    const onInput = term.onData((data) => {
      runner().daemon.write(sessionId, data);
    });

    void runner()
      .daemon.request<{ summary: unknown; scrollback: string }>({
        kind: 'attach',
        id: sessionId,
      })
      .then((res) => {
        // Only restored sessions return non-empty scrollback. For new
        // spawns the daemon returns '' and all output arrives via events.
        if (res?.scrollback) term.write(res.scrollback);
        term.focus();
      })
      .catch((err) => console.error('attach failed', err));

    // mousedown anywhere in the pane: ensure xterm has focus so typing works
    const onPaneDown = (): void => term.focus();
    host.addEventListener('mousedown', onPaneDown);

    return () => {
      host.removeEventListener('mousedown', onPaneDown);
      ro.disconnect();
      offEvent();
      onInput.dispose();
      term.dispose();
      void runner().daemon.request({ kind: 'detach', id: sessionId });
    };
  }, [sessionId]);

  // Re-theme xterm when the resolved theme changes.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = readThemeFromCss();
  }, [resolvedTheme]);

  return <div ref={hostRef} className="xterm-host" tabIndex={-1} />;
}
