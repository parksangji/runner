import { create } from 'zustand';

export type ToastKind = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
const AUTO_DISMISS_MS = 6000;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(kind, message) {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    // Errors linger until dismissed; transient kinds auto-expire.
    if (kind !== 'error') {
      setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
    }
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Convenience: surface a thrown error as a toast and return it for logging. */
export function toastError(label: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  useToasts.getState().push('error', `${label}: ${detail}`);
}
