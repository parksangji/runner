import { useMemo } from 'react';

interface Hunk {
  header: string;
  lines: { kind: ' ' | '+' | '-'; text: string }[];
}

function parseDiff(raw: string): Hunk[] {
  const lines = raw.split('\n');
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (current) hunks.push(current);
      current = { header: line, lines: [] };
    } else if (current) {
      const first = line[0];
      if (first === '+' || first === '-' || first === ' ') {
        current.lines.push({ kind: first, text: line.slice(1) });
      }
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

export function DiffViewer({ raw }: { raw: string }): JSX.Element {
  const hunks = useMemo(() => parseDiff(raw), [raw]);
  if (hunks.length === 0) {
    return (
      <div className="diff" style={{ color: 'var(--fg-dim)' }}>
        변경 없음
      </div>
    );
  }
  return (
    <div className="diff">
      {hunks.map((h, i) => (
        <div key={i}>
          <div className="hunk-header">{h.header}</div>
          {h.lines.map((l, j) => (
            <div
              key={j}
              className={`line ${l.kind === '+' ? 'add' : l.kind === '-' ? 'del' : ''}`}
            >
              <span>{l.kind === '+' || l.kind === '-' ? <input type="checkbox" /> : null}</span>
              <span>{l.kind}{l.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
