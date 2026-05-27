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

// Runner facing right, mid-sprint and leaning into the stride. The pose is
// deliberately asymmetric — front knee driven up-forward, back leg extended in
// push-off, arms counter-pumping — so the silhouette reads as "running" rather
// than a symmetric star jump, even at 16px.
const HEAD = { cx: 20.5, cy: 6.8, r: 3.3 };

const LIMBS = [
  capsule(19, 10, 15, 18.5, 2.9), // torso (shoulder -> hip), forward lean
  capsule(18.5, 11, 24, 13.5, 1.9), // front upper arm (driving forward)
  capsule(24, 13.5, 26.5, 9.5, 1.7), // front forearm (hand punched up-forward)
  capsule(18, 12, 12.5, 13.5, 1.9), // back upper arm
  capsule(12.5, 13.5, 10, 18, 1.7), // back forearm (swinging down-back)
  capsule(15, 18.5, 21, 21, 2.3), // front thigh (knee driven up)
  capsule(21, 21, 19.5, 26.5, 1.9), // front shin (foot reaching down-forward)
  capsule(15, 18.5, 10.5, 22.5, 2.3), // back thigh
  capsule(10.5, 22.5, 7, 26, 1.9), // back shin (extended, pushing off)
];

// Speed dashes trailing behind the runner.
const DASHES = [
  capsule(1.5, 10.5, 6, 10.5, 0.9),
  capsule(0.5, 15, 5.5, 15, 0.9),
  capsule(2, 19.5, 7, 19.5, 0.9),
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
