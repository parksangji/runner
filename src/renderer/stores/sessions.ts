import { create } from 'zustand';
import type { SessionSummary } from '@shared/protocol';
import { runner } from '../api';

interface SessionsState {
  sessions: Record<string, SessionSummary>;
  focusedId: string | null;
  hydrate: () => Promise<void>;
  reconcile: () => Promise<void>;
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

  // Pull the authoritative session list from the daemon and fold any drift
  // (cwd/alive/title, added/removed sessions) back into the store. The daemon
  // always knows the true cwd (it polls the shell pid), so this self-heals the
  // UI even when a live `cwd` event is missed — e.g. the daemon→main event
  // forwarder reconnected. Only writes state when something actually changed,
  // to avoid pointless re-renders on the polling interval.
  async reconcile() {
    let list: SessionSummary[];
    try {
      list = await runner().daemon.request<SessionSummary[]>({ kind: 'list' });
    } catch {
      return;
    }
    const cur = get().sessions;
    const next: Record<string, SessionSummary> = {};
    let changed = Object.keys(cur).length !== list.length;
    for (const s of list) {
      next[s.id] = s;
      const prev = cur[s.id];
      if (!prev || prev.cwd !== s.cwd || prev.alive !== s.alive || prev.title !== s.title) {
        changed = true;
      }
    }
    if (!changed) return;
    const focused = get().focusedId;
    const focusedId = focused && next[focused] ? focused : (Object.keys(next)[0] ?? null);
    set({ sessions: next, focusedId });
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

  // Spawn the daemon-side session only. The caller (createTerminal) is
  // responsible for adding the dockview panel *first* and then calling
  // upsert/setFocus — otherwise the session lands in the store before its
  // panel exists, the Center sync effect races in and adds a default (non-
  // split) panel, and ⌘D/⌘⇧D splits collapse into plain tabs.
  async spawn(cwd, cmd, args = []) {
    const cols = 120;
    const rows = 32;
    return runner().daemon.request<SessionSummary>({
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
