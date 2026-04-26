import { useTheme, type ThemeMode } from '../stores/theme';

const OPTIONS: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: 'light', icon: '☀', label: 'Light' },
  { mode: 'dark', icon: '☾', label: 'Dark' },
  { mode: 'system', icon: '🖥', label: 'System' },
];

export function TopBar(): JSX.Element {
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);

  // Git actions (Pull/Push/Commit/Branch) live per-directory in the Changes
  // panel, so the top bar carries the window-drag region, brand, and the
  // light/dark/system theme switch (right edge).
  return (
    <header className="topbar" role="banner">
      <span className="brand">runner</span>
      <div className="spacer" />
      <div className="theme-switch" role="group" aria-label="Theme">
        {OPTIONS.map((o) => (
          <button
            key={o.mode}
            type="button"
            className={mode === o.mode ? 'active' : ''}
            aria-pressed={mode === o.mode}
            title={o.label}
            onClick={() => setMode(o.mode)}
          >
            {o.icon}
          </button>
        ))}
      </div>
    </header>
  );
}
