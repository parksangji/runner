import { create } from 'zustand';
import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { useSessions } from './sessions';

export type SplitDir = 'right' | 'below' | 'left' | 'above';
export type FocusDir = 'left' | 'right' | 'up' | 'down';

interface DockviewState {
  api: DockviewApi | null;
  setApi: (api: DockviewApi | null) => void;
  createTerminal: (split?: SplitDir) => Promise<void>;
  splitFocused: (dir: SplitDir) => void;
  closeFocused: () => void;
  focusDirection: (dir: FocusDir) => void;
  toggleZoom: () => void;
}

function shortenCwd(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || cwd;
}

function panelCenter(panel: IDockviewPanel): { x: number; y: number; rect: DOMRect } | null {
  // dockview panels have `.element` only on group; we approach via api.activePanel.group?
  // Practical approach: query the DOM for the panel element by id.
  const el = document.querySelector(`[data-dv-panel-id="${panel.id}"]`) as HTMLElement | null;
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  }
  // Fallback: any descendant having a known role inside a group containing the panel
  const group = (panel as unknown as { group?: { element?: HTMLElement } }).group;
  if (group?.element) {
    const r = group.element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  }
  return null;
}

export const useDockview = create<DockviewState>((set, get) => ({
  api: null,
  setApi(api) {
    set({ api });
  },

  async createTerminal(split) {
    const { api } = get();
    if (!api) return;
    // Capture the active GROUP (not the panel) before any async work.
    // referenceGroup forces dockview to split from this group when a
    // direction is provided — bypassing the "tab-in-same-group" fallback
    // path that referencePanel can fall into when timing is unlucky.
    const refGroup = api.activeGroup ?? null;
    const focused = useSessions.getState().focusedId;
    const cwd =
      (focused && useSessions.getState().sessions[focused]?.cwd) ?? window.runner.env.home;
    const shell = window.runner.env.shell;
    try {
      const summary = await useSessions.getState().spawn(cwd, shell);
      const position =
        split && refGroup
          ? { referenceGroup: refGroup, direction: split as 'left' | 'right' | 'above' | 'below' }
          : undefined;
      api.addPanel({
        id: summary.id,
        component: 'terminal',
        params: { sessionId: summary.id, cwd },
        title: shortenCwd(cwd),
        ...(position ? { position } : {}),
      });
    } catch (err) {
      console.error('createTerminal failed', err);
    }
  },

  splitFocused(dir) {
    void get().createTerminal(dir);
  },

  closeFocused() {
    const { api } = get();
    if (!api) return;
    const active = api.activePanel;
    if (!active) return;
    const id = active.id;
    try {
      api.removePanel(active);
    } catch (err) {
      console.error('removePanel failed', err);
    }
    void useSessions.getState().kill(id);
  },

  toggleZoom() {
    const { api } = get();
    if (!api) return;
    if (api.hasMaximizedGroup()) {
      api.exitMaximizedGroup();
    } else if (api.activePanel) {
      api.maximizeGroup(api.activePanel);
    }
  },

  focusDirection(dir) {
    const { api } = get();
    if (!api) return;
    const active = api.activePanel;
    if (!active) {
      const first = api.panels[0];
      if (first) first.api.setActive();
      return;
    }
    const origin = panelCenter(active);
    if (!origin) return;
    let best: { panel: IDockviewPanel; score: number } | null = null;
    for (const p of api.panels) {
      if (p.id === active.id) continue;
      const c = panelCenter(p);
      if (!c) continue;
      const dx = c.x - origin.x;
      const dy = c.y - origin.y;
      // require panel to lie predominantly in requested direction
      const inDir =
        (dir === 'left' && dx < -2 && Math.abs(dy) < Math.abs(dx) + 1) ||
        (dir === 'right' && dx > 2 && Math.abs(dy) < Math.abs(dx) + 1) ||
        (dir === 'up' && dy < -2 && Math.abs(dx) <= Math.abs(dy) + 1) ||
        (dir === 'down' && dy > 2 && Math.abs(dx) <= Math.abs(dy) + 1);
      if (!inDir) continue;
      const dist = Math.hypot(dx, dy);
      if (!best || dist < best.score) best = { panel: p, score: dist };
    }
    if (best) {
      best.panel.api.setActive();
      // also focus the inner xterm so typing immediately works
      const el = document.querySelector(
        `[data-dv-panel-id="${best.panel.id}"] .xterm-helper-textarea`
      ) as HTMLTextAreaElement | null;
      el?.focus();
    } else {
      // fallback: cycle if no spatial neighbor (e.g., all panels are tabs in one group)
      const idx = api.panels.findIndex((p) => p.id === active.id);
      const step = dir === 'right' || dir === 'down' ? 1 : -1;
      const next = api.panels[(idx + step + api.panels.length) % api.panels.length];
      if (next) next.api.setActive();
    }
  },
}));
