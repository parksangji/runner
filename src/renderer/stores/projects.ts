import { create } from 'zustand';
import type { SessionSummary } from '@shared/protocol';
import { runner } from '../api';
import { persistedPaths } from './persistedPaths';

export interface Project {
  cwd: string;
  label: string;
  sessionIds: string[];
  pinned: boolean;
}

interface ProjectsState {
  projects: Record<string, Project>;
  pinned: string[];
  selectedCwd: string | null;
  selectedFile: string | null;
  setSelected: (cwd: string | null, file?: string | null) => void;
  togglePin: (cwd: string) => void;
  recompute: (sessions: SessionSummary[]) => void;
  loadPinned: () => Promise<void>;
}

function basename(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

let persistTimer: number | null = null;
function schedulePersist(pinned: string[]): void {
  if (persistTimer != null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(async () => {
    persistTimer = null;
    try {
      const { pinned: path } = await persistedPaths();
      await runner().persist.write(path, JSON.stringify(pinned, null, 2));
    } catch (err) {
      console.error('persist pinned failed', err);
    }
  }, 200);
}

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: {},
  pinned: [],
  selectedCwd: null,
  selectedFile: null,

  setSelected(cwd, file) {
    set({ selectedCwd: cwd, selectedFile: file ?? null });
  },

  togglePin(cwd) {
    const { pinned } = get();
    const next = pinned.includes(cwd) ? pinned.filter((p) => p !== cwd) : [...pinned, cwd];
    set({ pinned: next });
    schedulePersist(next);
    get().recompute([]);
  },

  recompute(sessions) {
    const grouped: Record<string, string[]> = {};
    for (const s of sessions) {
      const k = s.cwd;
      (grouped[k] ??= []).push(s.id);
    }
    const all = new Set<string>([...Object.keys(grouped), ...get().pinned]);
    const projects: Record<string, Project> = {};
    for (const cwd of all) {
      projects[cwd] = {
        cwd,
        label: basename(cwd) || cwd,
        sessionIds: grouped[cwd] ?? [],
        pinned: get().pinned.includes(cwd),
      };
    }
    set({ projects });
  },

  async loadPinned() {
    try {
      const { pinned: path } = await persistedPaths();
      const raw = await runner().persist.read(path);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
        set({ pinned: parsed as string[] });
        get().recompute([]);
      }
    } catch (err) {
      console.error('load pinned failed', err);
    }
  },
}));
