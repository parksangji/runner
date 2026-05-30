import { create } from 'zustand';

export type ToastKind = 'error' | 'success' | 'info';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
  /** Sticky toasts never auto-expire (e.g. an update prompt). */
  sticky?: boolean;
  /** 0–100; when set, the toast renders a progress bar. */
  progress?: number;
}

export interface ToastOptions {
  action?: ToastAction;
  sticky?: boolean;
  progress?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, opts?: ToastOptions) => number;
  update: (id: number, patch: Partial<Omit<Toast, 'id'>>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
const AUTO_DISMISS_MS = 6000;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(kind, message, opts) {
    const id = nextId++;
    set((s) => ({
      toasts: [
        ...s.toasts,
        {
          id,
          kind,
          message,
          action: opts?.action,
          sticky: opts?.sticky,
          progress: opts?.progress,
        },
      ],
    }));
    // Errors and sticky toasts linger until dismissed; transient kinds expire.
    if (kind !== 'error' && !opts?.sticky) {
      setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
    }
    return id;
  },
  update(id, patch) {
    // Lets long-running flows (e.g. the update download → install handshake)
    // morph a single sticky toast through its states instead of stacking
    // multiple toasts on top of each other.
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
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
