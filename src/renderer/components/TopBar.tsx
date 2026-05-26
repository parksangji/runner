import { useSessions } from '../stores/sessions';
import { useGit } from '../stores/git';
import { runner } from '../api';
import { useCommitDialog } from './CommitDialog';
import { useBranchDialog } from './BranchDialog';

export function TopBar(): JSX.Element {
  const focused = useSessions((s) => (s.focusedId ? s.sessions[s.focusedId] : null));
  const snapshots = useGit((s) => s.snapshots);
  const showCommit = useCommitDialog((s) => s.show);
  const showBranch = useBranchDialog((s) => s.show);

  const snap = focused
    ? Object.values(snapshots).find((sn) => sn.repoRoot && focused.cwd.startsWith(sn.repoRoot)) ??
      null
    : null;

  const cwd = focused?.cwd ?? '';
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
      if (cwd) await useGit.getState().refresh(cwd);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <header className="topbar" role="banner">
      <span className="brand">runner</span>
      <button
        type="button"
        aria-label="Pull"
        disabled={!cwd}
        onClick={() => void run(() => runner().git.pull(cwd))}
      >
        ⇣ Pull
        {snap && snap.behind > 0 ? <sup> {snap.behind}</sup> : null}
      </button>
      <button
        type="button"
        aria-label="Push"
        disabled={!cwd}
        onClick={() => void run(() => runner().git.push(cwd))}
      >
        ⇡ Push
        {snap && snap.ahead > 0 ? <sup> {snap.ahead}</sup> : null}
      </button>
      <button
        type="button"
        aria-label="Commit"
        disabled={!cwd}
        onClick={() => showCommit()}
      >
        Commit
      </button>
      <button
        type="button"
        aria-label="Branch"
        disabled={!cwd}
        onClick={() => showBranch()}
      >
        Branch
      </button>
      <div className="spacer" />
      {snap?.branch ? <span className="branch">⎇ {snap.branch}</span> : null}
    </header>
  );
}
