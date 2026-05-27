import { describe, expect, it } from 'vitest';
import { buildTree } from './file-tree';

const file = (path: string, kind = 'M'): { path: string; kind: string } => ({ path, kind });

describe('buildTree', () => {
  it('nests files under their directories', () => {
    const tree = buildTree([file('src/a.ts'), file('src/b.ts'), file('readme.md')]);
    // folders sort before files: [src/, readme.md]
    expect(tree.map((n) => n.name)).toEqual(['src', 'readme.md']);
    const src = tree[0]!;
    expect(src.file).toBeNull();
    expect(src.children.map((c) => c.name)).toEqual(['a.ts', 'b.ts']);
    expect(src.children.every((c) => c.file)).toBe(true);
  });

  it('collapses single-child directory chains into one row', () => {
    const tree = buildTree([file('src/renderer/components/Foo.tsx')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.name).toBe('src/renderer/components');
    expect(tree[0]!.children.map((c) => c.name)).toEqual(['Foo.tsx']);
  });

  it('does not collapse a directory that also branches', () => {
    const tree = buildTree([file('src/a/x.ts'), file('src/b/y.ts')]);
    expect(tree[0]!.name).toBe('src');
    expect(tree[0]!.children.map((c) => c.name)).toEqual(['a', 'b']);
  });

  it('sorts folders before files and alphabetically within each', () => {
    const tree = buildTree([file('z.ts'), file('lib/util.ts'), file('a.ts')]);
    expect(tree.map((n) => n.name)).toEqual(['lib', 'a.ts', 'z.ts']);
  });

  it('preserves the full path on file leaves', () => {
    const tree = buildTree([file('src/deep/nested/file.ts')]);
    const leaf = tree[0]!.children[0]!;
    expect(leaf.file?.path).toBe('src/deep/nested/file.ts');
    expect(leaf.name).toBe('file.ts');
  });
});
