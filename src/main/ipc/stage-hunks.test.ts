import { describe, expect, it } from 'vitest';
import { __test__ } from './stage-hunks';

const { parseDiff, buildSelectivePatch } = __test__;

const SAMPLE = `diff --git a/foo.txt b/foo.txt
index 1111111..2222222 100644
--- a/foo.txt
+++ b/foo.txt
@@ -1,5 +1,7 @@
 line 1
-line 2 old
+line 2 new
 line 3
+inserted A
+inserted B
 line 4
`;

describe('stage-hunks', () => {
  it('parses a diff into header + hunks', () => {
    const parsed = parseDiff(SAMPLE);
    expect(parsed.fileHeader[0]).toContain('diff --git');
    expect(parsed.hunks.length).toBe(1);
    const hunk = parsed.hunks[0]!;
    expect(hunk.oldStart).toBe(1);
    expect(hunk.newStart).toBe(1);
    expect(hunk.lines.length).toBe(7);
  });

  it('builds a patch containing only selected + lines', () => {
    const { fileHeader, hunks } = parseDiff(SAMPLE);
    // Select only "inserted A" (line index 4 in hunk 0)
    const patch = buildSelectivePatch(fileHeader, hunks, [
      { hunkIndex: 0, lineIndex: 4, kind: '+' },
    ]);
    expect(patch).toContain('+inserted A');
    expect(patch).not.toContain('+inserted B');
    // The deletion of "line 2 old" must NOT be in the patch (since unselected
    // deletions become context to keep the file shape consistent)
    expect(patch).not.toMatch(/^-line 2 old$/m);
    // Header should reflect new counts:
    //   old: 4 ctx-lines (line 1, line 2 old (now ctx), line 3, line 4)
    //   new: 5 lines (4 ctx + 1 inserted)
    expect(patch).toMatch(/^@@ -1,4 \+1,5 @@$/m);
  });

  it('keeps unselected deletions as context, drops unselected additions', () => {
    const { fileHeader, hunks } = parseDiff(SAMPLE);
    const patch = buildSelectivePatch(fileHeader, hunks, []);
    // No lines selected → patch has no hunks
    expect(patch).toBe(fileHeader.join('\n'));
  });
});
