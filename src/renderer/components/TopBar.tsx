import { useTheme, type ThemeMode } from '../stores/theme';
import { useConnection } from '../stores/connection';
import { useSettingsDialog } from './SettingsDialog';

const OPTIONS: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: 'light', icon: '☀', label: 'Light' },
  { mode: 'dark', icon: '☾', label: 'Dark' },
  { mode: 'system', icon: '🖥', label: 'System' },
];

function ConnectionPill(): JSX.Element | null {
  const status = useConnection((s) => s.status);
  const reconnect = useConnection((s) => s.reconnect);

  // Stay out of the way while the link is healthy.
  if (status === 'connected') return null;

  return (
    <div className={`conn-pill ${status}`} role="status" aria-live="polite">
      {status === 'reconnecting' ? (
        <>
          <span className="conn-dot" />
          Reconnecting…
        </>
      ) : (
        <>
          <span className="conn-dot" />
          Disconnected
          <button type="button" className="conn-retry" onClick={() => void reconnect()}>
            Reconnect
          </button>
        </>
      )}
    </div>
  );
}

export function TopBar(): JSX.Element {
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  const openSettings = useSettingsDialog((s) => s.show);

  // Git actions (Pull/Push/Commit/Branch) live per-directory in the Changes
  // panel, so the top bar carries the window-drag region, brand, and the
  // light/dark/system theme switch (right edge).
  return (
    <header className="topbar" role="banner">
      <span className="brand">runner</span>
      <ConnectionPill />
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
      <button
        type="button"
        className="topbar-settings"
        aria-label="Settings"
        title="Settings (⌘,)"
        onClick={openSettings}
      >
        ⚙
      </button>
    </header>
  );
}
