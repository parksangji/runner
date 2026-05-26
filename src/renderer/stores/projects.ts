import { create } from 'zustand';
import type { SessionSummary } from '@shared/protocol';

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
}

function basename(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
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
}));
