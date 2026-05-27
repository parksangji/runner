import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts, toastError } from './toast';

function reset(): void {
  useToasts.setState({ toasts: [] });
}

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes a toast with an incrementing id', () => {
    useToasts.getState().push('info', 'one');
    useToasts.getState().push('info', 'two');
    const { toasts } = useToasts.getState();
    expect(toasts.map((t) => t.message)).toEqual(['one', 'two']);
    expect(toasts[1]!.id).toBeGreaterThan(toasts[0]!.id);
  });

  it('auto-dismisses non-error toasts after the timeout', () => {
    useToasts.getState().push('success', 'gone soon');
    expect(useToasts.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it('keeps error toasts until dismissed', () => {
    useToasts.getState().push('error', 'sticky');
    vi.advanceTimersByTime(60000);
    expect(useToasts.getState().toasts).toHaveLength(1);
  });

  it('dismiss removes only the targeted toast', () => {
    useToasts.getState().push('error', 'a');
    useToasts.getState().push('error', 'b');
    const first = useToasts.getState().toasts[0]!.id;
    useToasts.getState().dismiss(first);
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['b']);
  });

  it('toastError formats label and Error message', () => {
    toastError('Pull failed', new Error('boom'));
    expect(useToasts.getState().toasts[0]!.message).toBe('Pull failed: boom');
    expect(useToasts.getState().toasts[0]!.kind).toBe('error');
  });
});
