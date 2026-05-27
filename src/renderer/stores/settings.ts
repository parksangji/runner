import { create } from 'zustand';

// Renderer-side terminal appearance. These map directly onto xterm options and
// apply live (TerminalView subscribes), so no daemon protocol change is needed.
export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  cursorBlink: boolean;
  scrollback: number;
}

export const DEFAULT_SETTINGS: TerminalSettings = {
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  cursorBlink: true,
  scrollback: 5000,
};

export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 32;
export const SCROLLBACK_MIN = 100;
export const SCROLLBACK_MAX = 100_000;

const STORAGE_KEY = 'runner.settings';

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// Coerce arbitrary parsed JSON into a valid, fully-populated settings object.
export function sanitize(raw: unknown): TerminalSettings {
  const p = (raw ?? {}) as Partial<TerminalSettings>;
  const family = typeof p.fontFamily === 'string' && p.fontFamily.trim() ? p.fontFamily : DEFAULT_SETTINGS.fontFamily;
  return {
    fontSize: clamp(p.fontSize ?? DEFAULT_SETTINGS.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX),
    fontFamily: family,
    cursorBlink: typeof p.cursorBlink === 'boolean' ? p.cursorBlink : DEFAULT_SETTINGS.cursorBlink,
    scrollback: clamp(p.scrollback ?? DEFAULT_SETTINGS.scrollback, SCROLLBACK_MIN, SCROLLBACK_MAX),
  };
}

interface SettingsState extends TerminalSettings {
  set: (patch: Partial<TerminalSettings>) => void;
  reset: () => void;
  init: () => void;
}

function persist(s: TerminalSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore — storage unavailable */
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,

  set(patch) {
    const next = sanitize({ ...current(get), ...patch });
    persist(next);
    set(next);
  },

  reset() {
    persist(DEFAULT_SETTINGS);
    set(DEFAULT_SETTINGS);
  },

  init() {
    let saved: unknown = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      /* ignore — fall back to defaults */
    }
    set(sanitize(saved));
  },
}));

function current(get: () => SettingsState): TerminalSettings {
  const s = get();
  return {
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    cursorBlink: s.cursorBlink,
    scrollback: s.scrollback,
  };
}
