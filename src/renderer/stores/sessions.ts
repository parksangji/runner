import { create } from 'zustand';
import type { SessionSummary } from '@shared/protocol';
import { runner } from '../api';

interface SessionsState {
  sessions: Record<string, SessionSummary>;
  focusedId: string | null;
  hydrate: () => Promise<void>;
  upsert: (s: SessionSummary) => void;
  remove: (id: string) => void;
  setFocus: (id: string | null) => void;
  spawn: (cwd: string, cmd: string, args?: string[]) => Promise<SessionSummary>;
  kill: (id: string) => Promise<void>;
}

export const useSessions = create<SessionsState>((set, get) => ({
  sessions: {},
  focusedId: null,

  async hydrate() {
    const list = await runner().daemon.request<SessionSummary[]>({ kind: 'list' });
    const map: Record<string, SessionSummary> = {};
    for (const s of list) map[s.id] = s;
    set({ sessions: map });
    if (!get().focusedId && list.length > 0) {
      const first = list[0];
      if (first) set({ focusedId: first.id });
    }
  },

  upsert(s) {
    set((state) => ({ sessions: { ...state.sessions, [s.id]: s } }));
  },

  remove(id) {
    set((state) => {
      const next = { ...state.sessions };
      delete next[id];
      const focusedId = state.focusedId === id ? (Object.keys(next)[0] ?? null) : state.focusedId;
      return { sessions: next, focusedId };
    });
  },

  setFocus(id) {
    set({ focusedId: id });
  },

  async spawn(cwd, cmd, args = []) {
    const cols = 120;
    const rows = 32;
    const summary = await runner().daemon.request<SessionSummary>({
      kind: 'spawn',
      spec: {
        cwd,
        cmd,
        args,
        env: {},
        cols,
        rows,
        title: cmd,
      },
    });
    get().upsert(summary);
    get().setFocus(summary.id);
    return summary;
  },

  async kill(id) {
    await runner().daemon.request({ kind: 'kill', id });
    get().remove(id);
  },
}));

export function bindDaemonEvents(): () => void {
  const off = runner().daemon.onEvent((evt) => {
    if (evt.kind === 'exit') {
      useSessions.getState().remove(evt.id);
    } else if (evt.kind === 'cwd') {
      const s = useSessions.getState().sessions[evt.id];
      if (s) useSessions.getState().upsert({ ...s, cwd: evt.cwd });
    }
  });
  return off;
}
