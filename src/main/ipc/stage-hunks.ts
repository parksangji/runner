import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IpcMain } from 'electron';

export interface SelectionLine {
  hunkIndex: number;
  lineIndex: number;
  kind: '+' | '-';
}

export interface StageHunksRequest {
  cwd: string;
  file: string;
  rawDiff: string;
  selection: SelectionLine[];
  unstage: boolean;
}

interface Hunk {
  headerLine: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[]; // raw including leading +/-/' '
}

const HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseDiff(raw: string): { fileHeader: string[]; hunks: Hunk[] } {
  const lines = raw.split('\n');
  const fileHeader: string[] = [];
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < lines.length && !(lines[i] ?? '').startsWith('@@')) {
    fileHeader.push(lines[i] ?? '');
    i += 1;
  }
  let cur: Hunk | null = null;
  for (; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const m = HEADER_RE.exec(line);
    if (m) {
      if (cur) hunks.push(cur);
      cur = {
        headerLine: line,
        oldStart: Number(m[1]),
        oldCount: m[2] ? Number(m[2]) : 1,
        newStart: Number(m[3]),
        newCount: m[4] ? Number(m[4]) : 1,
        lines: [],
      };
    } else if (cur) {
      if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
        cur.lines.push(line);
      } else if (line === '\\ No newline at end of file') {
        cur.lines.push(line);
      }
    }
  }
  if (cur) hunks.push(cur);
  return { fileHeader, hunks };
}

/**
 * Build a patch containing only the selected +/- lines from each hunk.
 * Unselected +/- lines become context: '+' is dropped entirely, '-' becomes ' '.
 */
function buildSelectivePatch(
  fileHeader: string[],
  hunks: Hunk[],
  selection: SelectionLine[]
): string {
  const selectedByHunk = new Map<number, Set<number>>();
  for (const s of selection) {
    let set = selectedByHunk.get(s.hunkIndex);
    if (!set) {
      set = new Set();
      selectedByHunk.set(s.hunkIndex, set);
    }
    set.add(s.lineIndex);
  }

  const out: string[] = [...fileHeader];
  hunks.forEach((h, hi) => {
    const picks = selectedByHunk.get(hi);
    if (!picks || picks.size === 0) return;
    const newLines: string[] = [];
    let oldCount = 0;
    let newCount = 0;
    h.lines.forEach((raw, li) => {
      if (raw.startsWith(' ')) {
        newLines.push(raw);
        oldCount += 1;
        newCount += 1;
      } else if (raw.startsWith('+')) {
        if (picks.has(li)) {
          newLines.push(raw);
          newCount += 1;
        } // else: drop
      } else if (raw.startsWith('-')) {
        if (picks.has(li)) {
          newLines.push(raw);
          oldCount += 1;
        } else {
          newLines.push(' ' + raw.slice(1));
          oldCount += 1;
          newCount += 1;
        }
      } else {
        newLines.push(raw);
      }
    });
    out.push(`@@ -${h.oldStart},${oldCount} +${h.newStart},${newCount} @@`);
    out.push(...newLines);
  });
  return out.join('\n');
}

function applyPatch(cwd: string, patch: string, unstage: boolean): { ok: boolean; error?: string } {
  const dir = mkdtempSync(join(tmpdir(), 'runner-patch-'));
  const patchFile = join(dir, 'patch.diff');
  try {
    writeFileSync(patchFile, patch);
    const args = ['apply', '--cached', '--whitespace=nowarn'];
    if (unstage) args.push('--reverse');
    args.push(patchFile);
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) {
      return { ok: false, error: result.stderr || result.stdout };
    }
    return { ok: true };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function registerStageHunksIpc(ipc: IpcMain): void {
  ipc.handle('git:stageHunks', (_e, req: StageHunksRequest) => {
    const { fileHeader, hunks } = parseDiff(req.rawDiff);
    const patch = buildSelectivePatch(fileHeader, hunks, req.selection);
    if (!fileHeader.length) {
      return { ok: false, error: 'No file header in diff; cannot construct patch' };
    }
    return applyPatch(req.cwd, patch + '\n', req.unstage);
  });
}

export const __test__ = { parseDiff, buildSelectivePatch };
