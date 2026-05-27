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
