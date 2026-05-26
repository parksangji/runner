import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { runner } from '../api';

interface Props {
  sessionId: string;
}

const themeDark = {
  background: '#0f1117',
  foreground: '#d6dbe5',
  cursor: '#6aa7ff',
  selectionBackground: 'rgba(106,167,255,0.25)',
};

export function TerminalView({ sessionId }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      theme: themeDark,
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
        void runner().daemon.request({ kind: 'write', id: sessionId, data: '\x15' });
        e.preventDefault();
        return false;
      }
      if (e.key === 'Backspace' && e.altKey && !cmd) {
        void runner().daemon.request({ kind: 'write', id: sessionId, data: '\x17' });
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
          void runner().daemon.request({
            kind: 'resize',
            id: sessionId,
            cols: term.cols,
            rows: term.rows,
          });
        } catch (err) {
          console.error('fit failed', err);
        }
      });
    };

    safeFit();
    const ro = new ResizeObserver(safeFit);
    ro.observe(host);

    const offEvent = runner().daemon.onEvent((evt) => {
      if (evt.kind === 'data' && evt.id === sessionId) {
        term.write(evt.data);
      }
    });

    const onInput = term.onData((data) => {
      void runner().daemon.request({ kind: 'write', id: sessionId, data });
    });

    // attach: pull scrollback so the user sees prior output after reattach
    void runner()
      .daemon.request<{ summary: unknown; scrollback: string }>({
        kind: 'attach',
        id: sessionId,
      })
      .then((res) => {
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

  return <div ref={hostRef} className="xterm-host" tabIndex={-1} />;
}
