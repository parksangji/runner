import { create } from 'zustand';

interface LayoutState {
  leftOpen: boolean;
  rightOpen: boolean;
  zoomed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  setZoom: (v: boolean) => void;
}

export const useLayoutPrefs = create<LayoutState>((set) => ({
  leftOpen: true,
  rightOpen: true,
  zoomed: false,
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  setZoom: (v) => set({ zoomed: v }),
}));
