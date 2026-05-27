import { useMemo } from 'react';
import { RUNNER_GRID, RUNNER_SPRITE } from './runner-pixels';

interface Props {
  size?: number;
}

/** The same pixel-art runner as the app icon, rendered as crisp SVG rects with
 *  a subtle bob and trailing motion dashes for a "running" feel. */
export function PixelRunner({ size = 104 }: Props): JSX.Element {
  const { body, dashes } = useMemo(() => {
    const body: JSX.Element[] = [];
    const dashes: JSX.Element[] = [];
    for (let y = 0; y < RUNNER_SPRITE.length; y++) {
      const row = RUNNER_SPRITE[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        // 1.04 overdraw hides hairline seams between cells when upscaled.
        if (ch === '#') {
          body.push(<rect key={`b${x}-${y}`} x={x} y={y} width={1.04} height={1.04} />);
        } else if (ch === ':') {
          dashes.push(<rect key={`d${x}-${y}`} x={x} y={y} width={1.04} height={1.04} />);
        }
      }
    }
    return { body, dashes };
  }, []);

  return (
    <svg
      className="pixel-runner"
      width={size}
      height={size}
      viewBox={`0 0 ${RUNNER_GRID} ${RUNNER_GRID}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Runner"
    >
      <defs>
        <linearGradient id="runner-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6db0ff" />
          <stop offset="1" stopColor="#356fe0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={RUNNER_GRID} height={RUNNER_GRID} rx="7.2" fill="url(#runner-grad)" />
      <g className="pixel-runner-dashes" fill="#ffffff">
        {dashes}
      </g>
      <g className="pixel-runner-body" fill="#f6f9ff">
        {body}
      </g>
    </svg>
  );
}
