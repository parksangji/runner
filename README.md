# Runner

> A Claude Code workbench — multiple terminals and git in a single window.

Runner is an Electron-based workbench for managing several terminal sessions
and git operations in one desktop app. Terminal sessions are owned by a
background daemon that lives independently of the window, so your shells stay
alive even after you close and reopen the window.

![Runner — light theme](assets/screenshot-light.png)

## Features

- **Multiple terminals** — split/tab layouts with automatic working-directory (cwd) tracking
- **Persistent sessions** — terminal PTYs are owned by the daemon and restored across app restarts
- **Per-directory git** — git repositories backing open terminals are grouped by directory in the Changes panel
- **Changes / diff** — per-file diff view, line-level staging, and Pull / Push / Commit / Branch / Discard / History
- **Conflict resolution** — merge/rebase progress indicator with Continue / Abort
- **Themes** — light / dark / system

### Light and dark themes

The theme switch in the top-right toggles light, dark, and system modes. The
selected mode is persisted; system mode follows the OS setting.

![Runner — dark theme](assets/screenshot-dark.png)

### Inline diffs with line-level staging

Click a changed file to open its diff over the terminal area. Stage individual
hunks or lines, or stage the whole file at once.

![Runner — diff view](assets/screenshot-diff.png)

## Architecture

```
src/
├── daemon/    # Background process that owns the PTYs (unix-socket RPC)
├── main/      # Electron main — IPC hub + daemon supervisor
├── preload/   # contextBridge security boundary
├── renderer/  # React UI (zustand, dockview, xterm)
└── shared/    # Protocol types / paths
```

## Develop / run

```bash
npm install
npm run dev        # development mode (electron-vite)
npm run build      # production build
npm run typecheck  # type check
npm run lint       # ESLint
npm run test       # unit tests (vitest)
npm run package    # package the app
```

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| ⌘T | New terminal |
| ⌘D / ⌘⇧D | Split right / down |
| ⌘W | Close current terminal |
| ⌘B | Toggle Changes panel |
| ⌘K | Command palette |

## Changelog

### 2026-05-27 — git feature expansion · conflict resolution · CI
- Added per-file **Discard** (revert working-tree changes; untracked files are deleted) and **Unstage** buttons in the Changes panel
- Wired the ConflictPanel to merge/rebase IPC — progress indicator plus **Continue** / **Abort** once conflicts are resolved
- Added **History** (🕑) to each directory group — a recent-commit history dialog
- Added an ESLint flat config (`npm run lint` now works) and GitHub Actions CI (typecheck/lint/test)

### 2026-04-26 — theme switch (light / dark / system)
- Added a ☀ / ☾ / 🖥 theme switch to the top-right of the top bar
- The selected mode is persisted to localStorage; system mode follows the OS setting
- The Welcome screen now uses the shared theme variables

### 2026-03-22 — diff overlay over the terminal area · Welcome · panel sync
- Clicking a changed file toggles a **diff page over the terminal area** (re-click or the close button dismisses it)
- A **Welcome screen** with keyboard-shortcut hints shows when no terminals are open
- Unified dockview panel sync to eliminate "invisible sessions" and restore ⌘D/⌘⇧D splitting
- The dockview tab bar now follows the app theme (light/dark)

### 2026-02-18 — UI overhaul: Changes panel · per-directory git
- Merged the left/right sidebars into a single left **Changes panel**
- Git repositories backing open terminals (splits included) are shown as **per-directory groups**, each with Pull/Push/Commit/Branch
- The commit/branch dialogs now take a target directory (cwd)
- **Drag-to-resize** the Changes panel width, with persisted state
- Periodic reconcile of the daemon session list to reflect cwd changes

### 2026-01-15 — backend: cwd tracking · IPC serialization · event forwarder
- Track cwd by polling the shell process's real working directory (handles shells without OSC 7 support)
- Serialize git snapshots into structured-clone-safe plain objects (fixes the IPC clone error)
- Re-attach the daemon event forwarder per client instance (prevents event loss on reconnect)
