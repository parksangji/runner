import { useEffect, useRef, useState } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { runner } from '../api';
import { useTheme } from '../stores/theme';
import { useSettings } from '../stores/settings';

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
    selectionBackground: get('--term-selection', 'rgba(106,167,255,0.35)'),
  };
}

export function TerminalView({ sessionId }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const disposedRef = useRef<boolean>(false);
  const initialThemeRender = useRef<boolean>(true);
  const resolvedTheme = useTheme((s) => s.resolved);
  const fontSize = useSettings((s) => s.fontSize);
  const fontFamily = useSettings((s) => s.fontFamily);
  const cursorBlink = useSettings((s) => s.cursorBlink);
  const scrollback = useSettings((s) => s.scrollback);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Stable handle so the (one-time) xterm key handler can open the React-driven
  // search bar without being recreated on every render.
  const openSearchRef = useRef<() => void>(() => {});
  openSearchRef.current = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.select());
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    disposedRef.current = false;
    initialThemeRender.current = true;

    // Read current settings synchronously at mount; live changes are applied
    // by the effect below (we deliberately don't depend on settings here, so
    // tweaking them never tears down and respawns the terminal).
    const cfg = useSettings.getState();
    const term = new Terminal({
      fontFamily: cfg.fontFamily,
      fontSize: cfg.fontSize,
      cursorBlink: cfg.cursorBlink,
      allowProposedApi: true,
      theme: readThemeFromCss(),
      scrollback: cfg.scrollback,
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const search = new SearchAddon();
    term.loadAddon(search);
    searchRef.current = search;
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
      if (cmd && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        openSearchRef.current();
        e.preventDefault();
        return false;
      }
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
      // ⌘+arrows (without alt — ⌘⌥+arrows are pane-focus chords handled globally):
      // ↓ jump to the latest output, ↑ to the top, ←/→ to line start/end (readline).
      if (cmd && !e.altKey && !e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === 'arrowdown') {
          term.scrollToBottom();
          e.preventDefault();
          return false;
        }
        if (k === 'arrowup') {
          term.scrollToTop();
          e.preventDefault();
          return false;
        }
        if (k === 'arrowleft') {
          runner().daemon.write(sessionId, '\x01');
          e.preventDefault();
          return false;
        }
        if (k === 'arrowright') {
          runner().daemon.write(sessionId, '\x05');
          e.preventDefault();
          return false;
        }
      }
      if (isAppShortcut(e)) return false;
      return true;
    });

    let pendingResize = false;
    // Tracks the hidden→visible transition that dockview's maximize toggle
    // drives by collapsing each other group's container to size 0 (it does
    // not use display:none — see dockview-core viewItem.setVisible). While
    // collapsed the browser zeroes scrollTop on the 0-height viewport and
    // xterm's DOM renderer can't paint, so on the way back we need to both
    // restore bottom-stickiness and force a full row repaint.
    let wasVisible = true;
    let stuckToBottom = true;
    const onResize = (): void => {
      if (pendingResize || !isAlive()) return;
      pendingResize = true;
      requestAnimationFrame(() => {
        pendingResize = false;
        if (!isAlive() || !host.isConnected) return;
        const rect = host.getBoundingClientRect();
        const visible = rect.width >= 20 && rect.height >= 20;
        if (!visible) {
          // Snapshot bottom-stickiness on the way out — once the container
          // collapses, viewportY drifts toward 0 and we can't tell anymore.
          if (wasVisible) {
            try {
              const buf = term.buffer.active;
              stuckToBottom = buf.viewportY >= buf.baseY;
            } catch {
              stuckToBottom = true;
            }
            wasVisible = false;
          }
          return;
        }
        try {
          // Maximizing/restoring a group reflows every other terminal; without
          // this, the row-count change can strand the viewport mid-scrollback.
          // Use the snapshot from the hidden transition; otherwise probe now.
          if (wasVisible) {
            const buf = term.buffer.active;
            stuckToBottom = buf.viewportY >= buf.baseY;
          }
          fit.fit();
          runner().daemon.resize(sessionId, term.cols, term.rows);
          // Hidden→visible: fit() is a no-op when cols/rows haven't changed,
          // so it never calls _renderService.clear() to drop the stale rows
          // the DOM renderer kept while we were 0-sized. Force the repaint.
          if (!wasVisible) {
            try {
              term.refresh(0, Math.max(0, term.rows - 1));
            } catch {
              /* ignore — late refresh during teardown */
            }
            wasVisible = true;
          }
          if (stuckToBottom) term.scrollToBottom();
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
      if (searchRef.current === search) searchRef.current = null;
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

  // Apply terminal appearance settings live. Font changes alter the cell
  // geometry, so re-fit and tell the daemon the new cols/rows afterwards.
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || disposedRef.current) return;
    try {
      term.options.fontSize = fontSize;
      term.options.fontFamily = fontFamily;
      term.options.cursorBlink = cursorBlink;
      term.options.scrollback = scrollback;
      fit?.fit();
      runner().daemon.resize(sessionId, term.cols, term.rows);
    } catch (err) {
      console.warn('apply settings failed', err);
    }
  }, [fontSize, fontFamily, cursorBlink, scrollback, sessionId]);

  const closeSearch = (): void => {
    setSearchOpen(false);
    searchRef.current?.clearDecorations();
    requestAnimationFrame(() => {
      try {
        termRef.current?.focus();
      } catch {
        /* ignore */
      }
    });
  };

  const find = (forward: boolean, incremental = false): void => {
    const q = searchInputRef.current?.value ?? '';
    if (!q) return;
    const opts = { caseSensitive: false, incremental };
    if (forward) searchRef.current?.findNext(q, opts);
    else searchRef.current?.findPrevious(q, opts);
  };

  return (
    <div className="xterm-wrap">
      <div ref={hostRef} className="xterm-host" tabIndex={-1} />
      {searchOpen ? (
        <div className="term-search" role="search">
          <input
            ref={searchInputRef}
            className="term-search-input"
            value={searchQuery}
            placeholder="Find in terminal"
            aria-label="Find in terminal"
            onChange={(e) => {
              setSearchQuery(e.target.value);
              find(true, true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                find(!e.shiftKey);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                closeSearch();
              }
            }}
          />
          <button type="button" className="term-search-btn" aria-label="Previous match" onClick={() => find(false)}>
            ↑
          </button>
          <button type="button" className="term-search-btn" aria-label="Next match" onClick={() => find(true)}>
            ↓
          </button>
          <button type="button" className="term-search-btn" aria-label="Close search" onClick={closeSearch}>
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
