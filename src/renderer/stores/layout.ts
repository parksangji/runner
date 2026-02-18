import { create } from 'zustand';
import { runner } from '../api';
import { persistedPaths } from './persistedPaths';

export const LEFT_WIDTH_MIN = 220;
export const LEFT_WIDTH_MAX = 640;
const LEFT_WIDTH_DEFAULT = 340;

interface LayoutPrefsState {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  zoomed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  setLeftWidth: (w: number) => void;
  setZoom: (v: boolean) => void;
  loadPrefs: () => Promise<void>;
}

interface PersistedPrefs {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth?: number;
  dock?: unknown;
}

const PREFS_KEY = '__prefs__';
const memoryPrefs: Record<string, unknown> = {};

async function writePrefs(): Promise<void> {
  try {
    const state = useLayoutPrefs.getState();
    const dock = useLayoutDock.getState().lastSerialized;
    const payload: PersistedPrefs = {
      leftOpen: state.leftOpen,
      rightOpen: state.rightOpen,
      leftWidth: state.leftWidth,
      dock,
    };
    memoryPrefs[PREFS_KEY] = payload;
    const { layout } = await persistedPaths();
    await runner().persist.write(layout, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('persist layout failed', err);
  }
}

let writeTimer: number | null = null;
function schedulePersist(): void {
  if (writeTimer != null) window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    writeTimer = null;
    void writePrefs();
  }, 200);
}

export const useLayoutPrefs = create<LayoutPrefsState>((set, get) => ({
  leftOpen: true,
  rightOpen: true,
  leftWidth: LEFT_WIDTH_DEFAULT,
  zoomed: false,

  toggleLeft() {
    set({ leftOpen: !get().leftOpen });
    schedulePersist();
  },

  toggleRight() {
    set({ rightOpen: !get().rightOpen });
    schedulePersist();
  },

  setLeftWidth(w) {
    const clamped = Math.max(LEFT_WIDTH_MIN, Math.min(LEFT_WIDTH_MAX, Math.round(w)));
    set({ leftWidth: clamped });
    schedulePersist();
  },

  setZoom(v) {
    set({ zoomed: v });
  },

  async loadPrefs() {
    try {
      const { layout } = await persistedPaths();
      const raw = await runner().persist.read(layout);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedPrefs;
      set({
        leftOpen: parsed.leftOpen ?? true,
        rightOpen: parsed.rightOpen ?? true,
        leftWidth: Math.max(
          LEFT_WIDTH_MIN,
          Math.min(LEFT_WIDTH_MAX, parsed.leftWidth ?? LEFT_WIDTH_DEFAULT)
        ),
      });
      if (parsed.dock !== undefined) {
        useLayoutDock.setState({ lastSerialized: parsed.dock, restored: false });
      }
    } catch (err) {
      console.error('load layout prefs failed', err);
    }
  },
}));

interface LayoutDockState {
  lastSerialized: unknown;
  restored: boolean;
  setSerialized: (data: unknown) => void;
  markRestored: () => void;
}

export const useLayoutDock = create<LayoutDockState>((set) => ({
  lastSerialized: null,
  restored: false,
  setSerialized(data) {
    set({ lastSerialized: data });
    schedulePersist();
  },
  markRestored() {
    set({ restored: true });
  },
}));
