import { useToasts } from '../stores/toast';

/** Stacked transient notifications in the bottom-right corner. Errors persist
 *  until dismissed; success/info auto-expire (see the toast store). */
export function Toasts(): JSX.Element | null {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-msg">{t.message}</span>
          {t.action ? (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action?.run();
                // The update flow morphs its toast through several states, so
                // the action callback dismisses it itself when appropriate.
                if (!t.sticky) dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
          >
            ✕
          </button>
          {typeof t.progress === 'number' ? (
            <div
              className="toast-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.max(0, Math.min(100, t.progress))}
            >
              <div
                className="toast-progress-bar"
                style={{ width: `${Math.max(0, Math.min(100, t.progress))}%` }}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
