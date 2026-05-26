import { useMemo, useState, useEffect } from 'react';
import type { SelectionLine } from '@main/ipc/stage-hunks';

export interface Hunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: { kind: ' ' | '+' | '-'; text: string; lineIndex: number }[];
}

const HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseDiffForView(raw: string): Hunk[] {
  const lines = raw.split('\n');
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let li = 0;
  for (const line of lines) {
    const m = HEADER_RE.exec(line);
    if (m) {
      if (current) hunks.push(current);
      current = {
        header: line,
        oldStart: Number(m[1]),
        newStart: Number(m[3]),
        lines: [],
      };
      li = 0;
      continue;
    }
    if (!current) continue;
    const first = line[0];
    if (first === '+' || first === '-' || first === ' ') {
      current.lines.push({ kind: first, text: line.slice(1), lineIndex: li });
      li += 1;
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

interface Props {
  raw: string;
  /** Called with the user-selected set of mutating lines. */
  onSelectionChange?: (selection: SelectionLine[]) => void;
  /** Reset selection (e.g., when file or staged-side changes). */
  resetKey?: string;
}

export function DiffViewer({ raw, onSelectionChange, resetKey }: Props): JSX.Element {
  const hunks = useMemo(() => parseDiffForView(raw), [raw]);
  // Selection map: hunkIndex -> Set<lineIndex>
  const [selection, setSelection] = useState<Record<number, Set<number>>>({});

  // Reset selection when file or staged-mode changes.
  useEffect(() => {
    setSelection({});
  }, [resetKey]);

  // Emit selection upward whenever it changes.
  useEffect(() => {
    if (!onSelectionChange) return;
    const out: SelectionLine[] = [];
    for (const [hStr, lines] of Object.entries(selection)) {
      const hunkIndex = Number(hStr);
      const hunk = hunks[hunkIndex];
      if (!hunk) continue;
      for (const lineIndex of lines) {
        const line = hunk.lines[lineIndex];
        if (!line || line.kind === ' ') continue;
        out.push({ hunkIndex, lineIndex, kind: line.kind });
      }
    }
    onSelectionChange(out);
  }, [selection, hunks, onSelectionChange]);

  const toggleLine = (hi: number, li: number): void => {
    setSelection((prev) => {
      const set = new Set(prev[hi] ?? []);
      if (set.has(li)) set.delete(li);
      else set.add(li);
      return { ...prev, [hi]: set };
    });
  };

  const toggleHunk = (hi: number): void => {
    const hunk = hunks[hi];
    if (!hunk) return;
    setSelection((prev) => {
      const allMutating = hunk.lines
        .map((l, idx) => ({ idx, kind: l.kind }))
        .filter((l) => l.kind !== ' ');
      const prevSet = prev[hi] ?? new Set<number>();
      const allSelected = allMutating.every((l) => prevSet.has(l.idx));
      const next = new Set<number>();
      if (!allSelected) {
        for (const l of allMutating) next.add(l.idx);
      }
      return { ...prev, [hi]: next };
    });
  };

  if (hunks.length === 0) {
    return (
      <div className="diff" style={{ color: 'var(--fg-dim)' }}>
        변경 없음
      </div>
    );
  }

  return (
    <div className="diff" aria-label="File diff">
      {hunks.map((h, hi) => {
        const checked = selection[hi] ?? new Set<number>();
        const mutating = h.lines.filter((l) => l.kind !== ' ').length;
        const allChecked = mutating > 0 && h.lines.every((l) => l.kind === ' ' || checked.has(l.lineIndex));
        return (
          <div key={hi}>
            <div className="hunk-header">
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => toggleHunk(hi)}
                  aria-label={`Toggle entire hunk ${hi + 1}`}
                />
                <span>{h.header}</span>
              </label>
            </div>
            {h.lines.map((l) => {
              const isChange = l.kind !== ' ';
              const cls =
                l.kind === '+' ? 'add' : l.kind === '-' ? 'del' : '';
              return (
                <label
                  key={l.lineIndex}
                  className={`line ${cls}`}
                  style={{ cursor: isChange ? 'pointer' : 'default' }}
                >
                  <span>
                    {isChange ? (
                      <input
                        type="checkbox"
                        checked={checked.has(l.lineIndex)}
                        onChange={() => toggleLine(hi, l.lineIndex)}
                        aria-label={`Toggle line ${l.lineIndex + 1}`}
                      />
                    ) : null}
                  </span>
                  <span>
                    {l.kind}
                    {l.text}
                  </span>
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
