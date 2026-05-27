import { create } from 'zustand';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  useSettings,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  SCROLLBACK_MIN,
  SCROLLBACK_MAX,
} from '../stores/settings';
import { useTheme, type ThemeMode } from '../stores/theme';

interface DialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useSettingsDialog = create<DialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

const mod = navigator.platform.toLowerCase().includes('mac') ? 'meta' : 'ctrl';

const THEMES: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'System' },
];

export function SettingsDialog(): JSX.Element | null {
  const open = useSettingsDialog((s) => s.open);
  const show = useSettingsDialog((s) => s.show);
  const hide = useSettingsDialog((s) => s.hide);

  const fontSize = useSettings((s) => s.fontSize);
  const fontFamily = useSettings((s) => s.fontFamily);
  const cursorBlink = useSettings((s) => s.cursorBlink);
  const scrollback = useSettings((s) => s.scrollback);
  const update = useSettings((s) => s.set);
  const reset = useSettings((s) => s.reset);

  const themeMode = useTheme((s) => s.mode);
  const setThemeMode = useTheme((s) => s.setMode);

  // ⌘, toggles the settings panel (standard macOS preferences chord).
  useHotkeys(
    `${mod}+comma`,
    () => (open ? hide() : show()),
    { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }
  );
  useHotkeys(
    'escape',
    () => {
      if (open) hide();
    },
    { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true, enabled: open }
  );

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div className="modal">
        <header>
          <h2>Settings</h2>
          <button type="button" aria-label="Close" onClick={hide}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>Theme</span>
            <select value={themeMode} onChange={(e) => setThemeMode(e.target.value as ThemeMode)}>
              {THEMES.map((t) => (
                <option key={t.mode} value={t.mode}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>
              Terminal font size <small style={{ color: 'var(--fg-dim)' }}>({fontSize}px)</small>
            </span>
            <input
              type="range"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              value={fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
              aria-label="Terminal font size"
            />
          </label>

          <label className="field">
            <span>Terminal font family</span>
            <input
              type="text"
              value={fontFamily}
              spellCheck={false}
              onChange={(e) => update({ fontFamily: e.target.value })}
              placeholder="ui-monospace, Menlo, monospace"
            />
          </label>

          <label className="field">
            <span>
              Scrollback <small style={{ color: 'var(--fg-dim)' }}>(lines kept in view)</small>
            </span>
            <input
              type="number"
              min={SCROLLBACK_MIN}
              max={SCROLLBACK_MAX}
              step={500}
              value={scrollback}
              onChange={(e) => update({ scrollback: Number(e.target.value) })}
              aria-label="Scrollback lines"
            />
          </label>

          <div className="field-row">
            <label>
              <input
                type="checkbox"
                checked={cursorBlink}
                onChange={(e) => update({ cursorBlink: e.target.checked })}
              />
              Blink cursor
            </label>
          </div>
        </div>
        <footer>
          <button type="button" onClick={reset}>
            Reset to defaults
          </button>
          <button type="button" onClick={hide} className="primary">
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
