import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useHotkeys } from 'react-hotkeys-hook';
import { useSessions } from '../stores/sessions';
import { useGit } from '../stores/git';
import { runner } from '../api';

interface DialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useCommitDialog = create<DialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

const mod = navigator.platform.toLowerCase().includes('mac') ? 'meta' : 'ctrl';

export function CommitDialog(): JSX.Element | null {
  const open = useCommitDialog((s) => s.open);
  const hide = useCommitDialog((s) => s.hide);
  const show = useCommitDialog((s) => s.show);
  const focused = useSessions((s) => (s.focusedId ? s.sessions[s.focusedId] : null));
  const refresh = useGit((s) => s.refresh);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [amend, setAmend] = useState(false);
  const [signoff, setSignoff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  const submit = useCallback(async (): Promise<void> => {
    if (!focused?.cwd) return;
    const message = body.trim() ? `${subject.trim()}\n\n${body.trim()}` : subject.trim();
    if (!message) {
      setError('Subject is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await runner().git.commit(focused.cwd, message, { amend, signoff });
      await refresh(focused.cwd);
      setSubject('');
      setBody('');
      setAmend(false);
      setSignoff(false);
      hide();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [focused, subject, body, amend, signoff, refresh, hide]);

  // ⌘⏎ opens the dialog if closed, submits if open.
  useHotkeys(
    `${mod}+enter`,
    () => {
      if (open) void submit();
      else show();
    },
    { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true }
  );
  // Close with Esc when open.
  useHotkeys(
    'escape',
    () => {
      if (open) hide();
    },
    { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true, enabled: open }
  );

  useEffect(() => {
    if (open) {
      setError(null);
      requestAnimationFrame(() => subjectRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Commit changes"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div className="modal">
        <header>
          <h2>Commit</h2>
          <button type="button" aria-label="Close" onClick={hide}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>Subject</span>
            <input
              ref={subjectRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={80}
              aria-required="true"
            />
            <small style={{ color: 'var(--fg-dim)' }}>{subject.length}/80</small>
          </label>
          <label className="field">
            <span>Body</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="optional — why, not what"
            />
          </label>
          <div className="field-row">
            <label>
              <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
              Amend previous commit
            </label>
            <label>
              <input
                type="checkbox"
                checked={signoff}
                onChange={(e) => setSignoff(e.target.checked)}
              />
              Sign-off
            </label>
          </div>
          {error ? (
            <div className="banner err" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <footer>
          <button type="button" onClick={hide} disabled={busy}>
            Cancel (Esc)
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !subject.trim()}
            className="primary"
          >
            {busy ? 'Committing…' : `Commit (${mod === 'meta' ? '⌘' : 'Ctrl'}⏎)`}
          </button>
        </footer>
      </div>
    </div>
  );
}
