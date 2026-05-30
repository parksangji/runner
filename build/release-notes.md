## Install

1. Download `Runner-<version>-arm64.dmg` (Apple Silicon) or `Runner-<version>.dmg` (Intel).
2. Open the DMG and drag `Runner.app` into `/Applications`.
3. **One-time step — clear the macOS quarantine flag:**

   ```bash
   xattr -cr /Applications/Runner.app
   ```

   Without this, macOS Gatekeeper will show "Runner is damaged and can't be opened" and move the app to the Trash, because the build is not yet signed with an Apple Developer ID. The `xattr` command removes the `com.apple.quarantine` extended attribute the browser added on download — the app itself is unchanged. Re-run the command after each update.

A signed + notarized build is on the roadmap, after which this step will no longer be needed.
