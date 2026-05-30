import { describe, expect, it } from 'vitest';
import { parseManifest } from './updater';

// Captured from a real v0.0.3 latest-mac.yml — same shape electron-builder
// emits for every release. If GitHub or electron-builder change the format,
// this is where we want the failure to land first.
const FIXTURE = `version: 0.0.3
files:
  - url: Runner-0.0.3-arm64-mac.zip
    sha512: ZIP_ARM64_SHA
    size: 103258052
  - url: Runner-0.0.3-mac.zip
    sha512: ZIP_X64_SHA
    size: 109313066
  - url: Runner-0.0.3-arm64.dmg
    sha512: DMG_ARM64_SHA
    size: 107570236
  - url: Runner-0.0.3.dmg
    sha512: DMG_X64_SHA
    size: 113622799
path: Runner-0.0.3-arm64-mac.zip
sha512: ZIP_ARM64_SHA
releaseNotes: |
  multi-line
  notes
  here
releaseDate: '2026-05-30T05:45:18.857Z'
`;

describe('parseManifest', () => {
  it('returns the arm64 DMG sha512', () => {
    expect(parseManifest(FIXTURE, 'Runner-0.0.3-arm64.dmg')).toBe('DMG_ARM64_SHA');
  });

  it('returns the x64 DMG sha512 — no arch suffix in the filename', () => {
    expect(parseManifest(FIXTURE, 'Runner-0.0.3.dmg')).toBe('DMG_X64_SHA');
  });

  it('matches on suffix so partial filenames disambiguate -arm64 vs the plain build', () => {
    // The x64 entry "Runner-0.0.3.dmg" must NOT be returned when arm64 is asked.
    expect(parseManifest(FIXTURE, 'Runner-0.0.3-arm64.dmg')).not.toBe('DMG_X64_SHA');
  });

  it('returns null when the target is not in the manifest', () => {
    expect(parseManifest(FIXTURE, 'Runner-0.0.3-linux.AppImage')).toBeNull();
  });
});
