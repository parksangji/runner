import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useHotkeys } from 'react-hotkeys-hook';
import { useDockview } from '../stores/dockview';
import { useLayoutPrefs } from '../stores/layout';
import { useTheme, type ThemeMode } from '../stores/theme';
import { useCommitDialog } from './CommitDialog';
import { useBranchDialog } from './BranchDialog';
import { useSessions } from '../stores/sessions';
import { runner } from '../api';

interface PaletteState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useCommandPalette = create<PaletteState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

interface Command {
  id: string;
  title: string;
  group: string;
  hint?: string;
  run: () => void | Promise<void>;
}

const mod = navigator.platform.toLowerCase().includes('mac') ? 'meta' : 'ctrl';

function buildCommands(): Command[] {
  return [
    {
      id: 'terminal.new',
      title: 'New Terminal',
      group: 'Terminal',
      hint: `${mod === 'meta' ? '⌘' : 'Ctrl'}T`,
      run: () => useDockview.getState().createTerminal(),
    },
    {
      id: 'terminal.split.right',
      title: 'Split Right',
      group: 'Terminal',
      hint: `${mod === 'meta' ? '⌘' : 'Ctrl'}D`,
      run: () => useDockview.getState().splitFocused('right'),
    },
    {
      id: 'terminal.split.below',
      title: 'Split Down',
      group: 'Terminal',
      hint: `${mod === 'meta' ? '⌘⇧' : 'Ctrl+Shift+'}D`,
      run: () => useDockview.getState().splitFocused('below'),
    },
    {
      id: 'terminal.split.left',
      title: 'Split Left',
      group: 'Terminal',
      hint: `${mod === 'meta' ? '⌘⌥' : 'Ctrl+Alt+'}D`,
      run: () => useDockview.getState().splitFocused('left'),
    },
    {
      id: 'terminal.split.above',
      title: 'Split Up',
      group: 'Terminal',
      hint: `${mod === 'meta' ? '⌘⌥⇧' : 'Ctrl+Alt+Shift+'}D`,
      run: () => useDockview.getState().splitFocused('above'),
    },
    {
      id: 'terminal.close',
      title: 'Close Pane',
      group: 'Terminal',
      hint: `${mod === 'meta' ? '⌘' : 'Ctrl+'}W`,
      run: () => useDockview.getState().closeFocused(),
    },
    {
      id: 'terminal.zoom',
      title: 'Toggle Zoom',
      group: 'Terminal',
      hint: `${mod === 'meta' ? '⌘⇧' : 'Ctrl+Shift+'}⏎`,
      run: () => useDockview.getState().toggleZoom(),
    },
    {
      id: 'view.left',
      title: 'Toggle Left Sidebar',
      group: 'View',
      hint: `${mod === 'meta' ? '⌘' : 'Ctrl+'}B`,
      run: () => useLayoutPrefs.getState().toggleLeft(),
    },
    {
      id: 'view.right',
      title: 'Toggle Right Sidebar',
      group: 'View',
      hint: `${mod === 'meta' ? '⌘⇧' : 'Ctrl+Shift+'}B`,
      run: () => useLayoutPrefs.getState().toggleRight(),
    },
    {
      id: 'git.commit',
      title: 'Commit…',
      group: 'Git',
      hint: `${mod === 'meta' ? '⌘' : 'Ctrl+'}⏎`,
      run: () => useCommitDialog.getState().show(),
    },
    {
      id: 'git.branch',
      title: 'Switch Branch…',
      group: 'Git',
      run: () => useBranchDialog.getState().show(),
    },
    {
      id: 'git.pull',
      title: 'Pull',
      group: 'Git',
      run: async () => {
        const cwd = useSessions.getState().sessions[useSessions.getState().focusedId ?? '']?.cwd;
        if (cwd) await runner().git.pull(cwd);
      },
    },
    {
      id: 'git.push',
      title: 'Push',
      group: 'Git',
      run: async () => {
        const cwd = useSessions.getState().sessions[useSessions.getState().focusedId ?? '']?.cwd;
        if (cwd) await runner().git.push(cwd);
      },
    },
    ...(['system', 'light', 'dark'] as ThemeMode[]).map<Command>((m) => ({
      id: `theme.${m}`,
      title: `Theme: ${m.charAt(0).toUpperCase()}${m.slice(1)}`,
      group: 'Appearance',
      run: () => useTheme.getState().setMode(m),
    })),
  ];
}

function score(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 60;
  // simple subsequence match
  let ti = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return 0;
    ti = idx + 1;
  }
  return 30;
}

export function CommandPalette(): JSX.Element | null {
  const open = useCommandPalette((s) => s.open);
  const show = useCommandPalette((s) => s.show);
  const hide = useCommandPalette((s) => s.hide);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useHotkeys(
    `${mod}+k`,
    () => (open ? hide() : show()),
    { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }
  );
  useHotkeys(
    'escape',
    () => {
      if (open) hide();
    },
    { enableOnFormTags: true, enableOnContentEditable: true, enabled: open, preventDefault: true }
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo(() => buildCommands(), []);
  const filtered = useMemo(() => {
    const ranked = commands
      .map((c) => ({ c, s: Math.max(score(query, c.title), score(query, c.group)) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);
    return ranked.map((r) => r.c);
  }, [commands, query]);

  if (!open) return null;

  const exec = async (cmd: Command): Promise<void> => {
    hide();
    try {
      await cmd.run();
    } catch (err) {
      console.error('command failed', cmd.id, err);
    }
  };

  return (
    <div
      className="modal-backdrop palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div className="palette" role="combobox" aria-expanded="true">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(filtered.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const cmd = filtered[active];
              if (cmd) void exec(cmd);
            }
          }}
          placeholder="Type a command…"
          aria-label="Command search"
        />
        <ul role="listbox" className="palette-list">
          {filtered.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onClick={() => void exec(c)}
            >
              <span className="palette-group">{c.group}</span>
              <span className="palette-title">{c.title}</span>
              {c.hint ? <span className="palette-hint">{c.hint}</span> : null}
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="palette-empty">No commands match</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
