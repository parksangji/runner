import { describe, expect, it } from 'vitest';
import { parseDiffForView } from './DiffViewer';

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
@@ -20,2 +22,2 @@
-gone
+here
 tail
`;

describe('parseDiffForView', () => {
  it('splits a diff into hunks with parsed headers', () => {
    const hunks = parseDiffForView(SAMPLE);
    expect(hunks.length).toBe(2);
    expect(hunks[0]!.oldStart).toBe(1);
    expect(hunks[0]!.newStart).toBe(1);
    expect(hunks[1]!.oldStart).toBe(20);
    expect(hunks[1]!.newStart).toBe(22);
  });

  it('classifies each line by kind and strips the leading marker', () => {
    const [hunk] = parseDiffForView(SAMPLE);
    expect(hunk!.lines).toContainEqual({ kind: ' ', text: 'line 1', lineIndex: 0 });
    expect(hunk!.lines).toContainEqual({ kind: '-', text: 'line 2 old', lineIndex: 1 });
    expect(hunk!.lines).toContainEqual({ kind: '+', text: 'line 2 new', lineIndex: 2 });
  });

  it('numbers lines per hunk starting at zero', () => {
    const hunks = parseDiffForView(SAMPLE);
    expect(hunks[0]!.lines[0]!.lineIndex).toBe(0);
    expect(hunks[1]!.lines[0]!.lineIndex).toBe(0);
  });

  it('ignores content before the first hunk header', () => {
    const hunks = parseDiffForView(SAMPLE);
    const allText = hunks.flatMap((h) => h.lines.map((l) => l.text));
    expect(allText).not.toContain('diff --git a/foo.txt b/foo.txt');
  });

  it('returns no hunks for an empty diff', () => {
    expect(parseDiffForView('')).toEqual([]);
  });
});
