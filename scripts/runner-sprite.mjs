// Shared pixel-art runner geometry.
//
// The runner is drawn in a 32x32 logical grid as a small set of capsules
// (thick line segments) plus a head circle and a few motion dashes. Both the
// app-icon generator (scripts/gen-icon.mjs) and any tooling that wants the
// raw sprite consume this so the figure stays identical everywhere.

/** @typedef {{ x: number, y: number }} Pt */

const GRID = 32;

// Capsule: every point within `r` of segment a-b is filled.
function capsule(ax, ay, bx, by, r) {
  return { ax, ay, bx, by, r };
}

// Runner facing right, leaning into a forward stride.
const HEAD = { cx: 19.5, cy: 6.5, r: 3.4 };

const LIMBS = [
  capsule(18, 10, 13.5, 19, 2.6), // torso (shoulder -> hip)
  capsule(18, 11, 23, 12.5, 1.9), // front upper arm
  capsule(23, 12.5, 24.5, 9, 1.7), // front forearm (raised)
  capsule(17, 12, 12, 15, 1.9), // back upper arm
  capsule(12, 15, 8.5, 13, 1.7), // back forearm
  capsule(14, 18.5, 19, 24, 2.2), // front thigh
  capsule(19, 24, 22.5, 27.5, 2.0), // front shin (planted)
  capsule(13.5, 19, 9, 23, 2.2), // back thigh
  capsule(9, 23, 6, 26, 2.0), // back shin (pushing off)
];

// Speed dashes trailing behind the runner.
const DASHES = [
  capsule(2, 11, 7, 11, 0.9),
  capsule(0.5, 16, 6, 16, 0.9),
  capsule(2.5, 21, 8, 21, 0.9),
];

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Classify a logical grid cell (cx, cy are cell centers in 0..GRID space).
 * @returns {'body' | 'dash' | null}
 */
function classify(cx, cy) {
  if (Math.hypot(cx - HEAD.cx, cy - HEAD.cy) <= HEAD.r) return 'body';
  for (const c of LIMBS) {
    if (distToSeg(cx, cy, c.ax, c.ay, c.bx, c.by) <= c.r) return 'body';
  }
  for (const c of DASHES) {
    if (distToSeg(cx, cy, c.ax, c.ay, c.bx, c.by) <= c.r) return 'dash';
  }
  return null;
}

/**
 * Build a GRID x GRID matrix of cell kinds ('body' | 'dash' | null), sampled
 * at cell centers. Pure pixel-art: no anti-aliasing.
 * @returns {Array<Array<'body'|'dash'|null>>}
 */
export function spriteMatrix() {
  const m = [];
  for (let y = 0; y < GRID; y++) {
    const row = [];
    for (let x = 0; x < GRID; x++) {
      row.push(classify(x + 0.5, y + 0.5));
    }
    m.push(row);
  }
  return m;
}

export { GRID };
