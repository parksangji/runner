// Pure helpers for the Changes panel's tree (module) view. Kept free of React
// and browser globals so it can be unit-tested without a DOM environment.

export interface FileRow {
  path: string;
  kind: string;
}

export interface TreeNode {
  name: string;
  /** Full relative path (dir or file). */
  path: string;
  file: FileRow | null;
  children: TreeNode[];
}

/** Fold flat file paths into a directory tree: single-child directory chains
 *  collapse into one row (src/renderer/components → one node), and folders sort
 *  before files, each alphabetically — the "module" feel. */
export function buildTree(files: FileRow[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', file: null, children: [] };
  for (const f of files) {
    const segs = f.path.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      const isLeaf = i === segs.length - 1;
      const segPath = segs.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === seg && (isLeaf ? !!c.file : !c.file));
      if (!child) {
        child = { name: seg, path: segPath, file: isLeaf ? f : null, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  const normalize = (n: TreeNode): TreeNode => {
    let cur = n;
    while (!cur.file && cur.children.length === 1 && !cur.children[0]!.file) {
      const only = cur.children[0]!;
      cur = { ...only, name: `${cur.name}/${only.name}`, path: only.path };
    }
    cur.children = cur.children.map(normalize).sort(sortNodes);
    return cur;
  };
  return root.children.map(normalize).sort(sortNodes);
}

function sortNodes(a: TreeNode, b: TreeNode): number {
  if (!!a.file !== !!b.file) return a.file ? 1 : -1;
  return a.name.localeCompare(b.name);
}
