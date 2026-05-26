import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';
type Resolved = 'light' | 'dark';

function systemPreference(): Resolved {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(mode: ThemeMode): Resolved {
  return mode === 'system' ? systemPreference() : mode;
}

function apply(resolved: Resolved): void {
  document.documentElement.setAttribute('data-theme', resolved);
}

interface ThemeState {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (mode: ThemeMode) => void;
  init: () => void;
}

const STORAGE_KEY = 'runner.theme';

export const useTheme = create<ThemeState>((set, get) => ({
  mode: 'system',
  resolved: systemPreference(),

  setMode(mode) {
    const resolved = resolve(mode);
    apply(resolved);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    set({ mode, resolved });
  },

  init() {
    let initial: ThemeMode = 'system';
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') initial = saved;
    } catch {
      /* ignore */
    }
    const resolved = resolve(initial);
    apply(resolved);
    set({ mode: initial, resolved });

    // Keep system mode in sync with OS pref changes.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      if (get().mode === 'system') {
        const next: Resolved = mq.matches ? 'dark' : 'light';
        apply(next);
        set({ resolved: next });
      }
    };
    mq.addEventListener('change', onChange);
  },
}));
