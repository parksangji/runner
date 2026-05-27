import { describe, expect, it } from 'vitest';
import type { StatusResult } from 'simple-git';
import { __test__ } from './git';

const { plainStatus } = __test__;

// simple-git returns class instances (StatusResult/FileStatusResult) that fail
// Electron's structured-clone over IPC. plainStatus must flatten them; this
// guards the regression that motivated it (WORKLOG bug #1).
function fakeStatus(): StatusResult {
  return {
    current: 'main',
    tracking: 'origin/main',
    ahead: 0,
    behind: 0,
    detached: false,
    modified: ['a.ts'],
    created: ['b.ts'],
    deleted: ['c.ts'],
    not_added: ['d.ts'],
    conflicted: ['e.ts'],
    staged: ['a.ts'],
    renamed: [],
    files: [
      { path: 'a.ts', index: 'M', working_dir: ' ', from: undefined },
      { path: 'd.ts', index: '?', working_dir: '?', from: undefined },
    ],
    // A method to prove we don't carry the class instance across.
    isClean: () => false,
  } as unknown as StatusResult;
}

describe('plainStatus', () => {
  it('projects the fields the UI consumes', () => {
    const p = plainStatus(fakeStatus());
    expect(p.current).toBe('main');
    expect(p.modified).toEqual(['a.ts']);
    expect(p.created).toEqual(['b.ts']);
    expect(p.deleted).toEqual(['c.ts']);
    expect(p.not_added).toEqual(['d.ts']);
    expect(p.conflicted).toEqual(['e.ts']);
    expect(p.staged).toEqual(['a.ts']);
    expect(p.files).toEqual([
      { path: 'a.ts', index: 'M', working_dir: ' ' },
      { path: 'd.ts', index: '?', working_dir: '?' },
    ]);
  });

  it('is a plain, structured-clone-safe object (no methods)', () => {
    const p = plainStatus(fakeStatus());
    expect('isClean' in p).toBe(false);
    // structuredClone throws on functions/class instances — must not throw.
    expect(() => structuredClone(p)).not.toThrow();
  });
});
