// Generates the Runner app icon from the shared pixel-art sprite.
//
// No image libraries: we hand-encode RGBA PNGs (zlib is built into Node) and
// then let macOS `iconutil` fold the iconset into build/icon.icns. Re-run with
//   node scripts/gen-icon.mjs
// whenever the sprite in runner-sprite.mjs changes.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { spriteMatrix, GRID } from './runner-sprite.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, '..', 'build');
const iconset = join(buildDir, 'icon.iconset');

// ---- palette -------------------------------------------------------------
const BG_TOP = [0x6d, 0xb0, 0xff]; // accent blue (top)
const BG_BOT = [0x35, 0x6f, 0xe0]; // accent blue (bottom)
const BODY = [0xf6, 0xf9, 0xff]; // runner figure
const DASH = [0xff, 0xff, 0xff, 0x80]; // motion trails (semi-transparent)

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

// ---- minimal PNG encoder (RGBA, 8-bit) -----------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- compositing ---------------------------------------------------------
function renderIcon(size) {
  const sprite = spriteMatrix();
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.225; // rounded-square mask
  const pad = size * 0.07;
  const cell = (size - pad * 2) / GRID;

  const cornerDist = (x, y) => {
    // distance outside the rounded-rect corner; <=0 means inside.
    const cx = Math.max(radius - x, x - (size - radius), 0);
    const cy = Math.max(radius - y, y - (size - radius), 0);
    return Math.hypot(cx, cy) - radius;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect alpha (1px feather for a clean edge)
      const d = cornerDist(x + 0.5, y + 0.5);
      const maskA = d <= 0 ? 1 : d >= 1 ? 0 : 1 - d;
      if (maskA <= 0) {
        rgba[i + 3] = 0;
        continue;
      }
      // background gradient
      const t = y / size;
      let r = lerp(BG_TOP[0], BG_BOT[0], t);
      let g = lerp(BG_TOP[1], BG_BOT[1], t);
      let b = lerp(BG_TOP[2], BG_BOT[2], t);

      // sprite overlay
      const sx = Math.floor((x - pad) / cell);
      const sy = Math.floor((y - pad) / cell);
      if (sx >= 0 && sx < GRID && sy >= 0 && sy < GRID) {
        const kind = sprite[sy][sx];
        if (kind === 'body') {
          [r, g, b] = BODY;
        } else if (kind === 'dash') {
          const a = DASH[3] / 255;
          r = lerp(r, DASH[0], a);
          g = lerp(g, DASH[1], a);
          b = lerp(b, DASH[2], a);
        }
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = Math.round(maskA * 255);
    }
  }
  return encodePng(size, size, rgba);
}

// ---- emit ----------------------------------------------------------------
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });

const variants = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

for (const [name, size] of variants) {
  writeFileSync(join(iconset, name), renderIcon(size));
}

// Standalone PNG for Linux / docs / the renderer welcome screen fallback.
writeFileSync(join(buildDir, 'icon.png'), renderIcon(1024));

// Emit the sprite as a TS module so the renderer's welcome-screen PixelRunner
// draws the exact same figure as the icon (single source of truth).
{
  const matrix = spriteMatrix();
  const enc = matrix
    .map((row) => row.map((k) => (k === 'body' ? '#' : k === 'dash' ? ':' : '.')).join(''))
    .map((line) => `  '${line}',`)
    .join('\n');
  const ts =
    `// AUTO-GENERATED by scripts/gen-icon.mjs — do not edit by hand.\n` +
    `// '#' = runner body, ':' = motion dash, '.' = empty.\n` +
    `export const RUNNER_GRID = ${GRID};\n` +
    `export const RUNNER_SPRITE: string[] = [\n${enc}\n];\n`;
  writeFileSync(join(here, '..', 'src', 'renderer', 'components', 'runner-pixels.ts'), ts);
}

try {
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(buildDir, 'icon.icns')]);
  console.log('wrote build/icon.icns, build/icon.png');
} catch (err) {
  console.warn('iconutil failed (mac-only); PNGs written, .icns skipped:', err.message);
}
