import { create } from 'zustand';
import { runner } from '../api';
import type { GitSnapshot } from '@main/ipc/git';

interface GitState {
  snapshots: Record<string, GitSnapshot>;
  loading: Record<string, boolean>;
  refresh: (cwd: string) => Promise<GitSnapshot | null>;
}

export const useGit = create<GitState>((set, get) => ({
  snapshots: {},
  loading: {},

  async refresh(cwd) {
    set((s) => ({ loading: { ...s.loading, [cwd]: true } }));
    try {
      const snap = await runner().git.snapshot(cwd);
      const key = snap.repoRoot ?? cwd;
      set((s) => ({ snapshots: { ...s.snapshots, [key]: snap } }));
      return snap;
    } catch {
      return null;
    } finally {
      set((s) => ({ loading: { ...s.loading, [cwd]: false } }));
    }
  },
}));

export function snapshotFor(cwd: string): GitSnapshot | null {
  const state = useGit.getState();
  for (const snap of Object.values(state.snapshots)) {
    if (snap.repoRoot && cwd.startsWith(snap.repoRoot)) return snap;
  }
  return null;
}
