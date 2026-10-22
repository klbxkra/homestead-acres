/**
 * Draws the app icons (PLAN.md Phase 7, PWA) without any image tools: a tiny
 * anti-aliased rasterizer and PNG encoder on top of Node's zlib.
 * Run with `npm run icons`; the PNGs it writes to public/icons are committed.
 *
 *   icon-192.png, icon-512.png   standard icons ("any")
 *   maskable-512.png             full-bleed, art kept inside the 80% safe circle
 *   apple-touch-icon.png         180x180 for iOS home screens
 *   favicon-32.png               browser tab
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SS = 4; // 4x4 samples per pixel for smooth edges

class Canvas {
  constructor(size) {
    this.size = size;
    this.px = new Float32Array(size * size * 4); // premultiplied RGBA 0..1
  }

  /** Fills every pixel whose samples pass `inside(x, y)` (coordinates 0..1). */
  fill(color, inside, bbox = [0, 0, 1, 1]) {
    const [r, g, b, a = 1] = color;
    const n = this.size;
    const x0 = Math.max(0, Math.floor(bbox[0] * n));
    const y0 = Math.max(0, Math.floor(bbox[1] * n));
    const x1 = Math.min(n, Math.ceil(bbox[2] * n));
    const y1 = Math.min(n, Math.ceil(bbox[3] * n));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            if (inside((px + (sx + 0.5) / SS) / n, (py + (sy + 0.5) / SS) / n)) hits++;
          }
        }
        if (!hits) continue;
        const cov = (hits / (SS * SS)) * a;
        const i = (py * n + px) * 4;
        const keep = 1 - cov;
        this.px[i] = r * cov + this.px[i] * keep;
        this.px[i + 1] = g * cov + this.px[i + 1] * keep;
        this.px[i + 2] = b * cov + this.px[i + 2] * keep;
        this.px[i + 3] = cov + this.px[i + 3] * keep;
      }
    }
  }

  /** Vertical gradient over the whole canvas, clipped by `inside`. */
  gradient(top, bottom, inside) {
    const n = this.size;
    for (let py = 0; py < n; py++) {
      const t = py / (n - 1);
      const c = top.map((v, k) => v + (bottom[k] - v) * t);
      this.fill(c, inside, [0, py / n, 1, (py + 1) / n]);
    }
  }

  png() {
    const n = this.size;
    const raw = Buffer.alloc((n * 4 + 1) * n);
    for (let y = 0; y < n; y++) {
      raw[y * (n * 4 + 1)] = 0; // filter: none
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        const a = this.px[i + 3];
        const o = y * (n * 4 + 1) + 1 + x * 4;
        // Un-premultiply for PNG's straight alpha.
        raw[o] = a ? Math.round(Math.min(1, this.px[i] / a) * 255) : 0;
        raw[o + 1] = a ? Math.round(Math.min(1, this.px[i + 1] / a) * 255) : 0;
        raw[o + 2] = a ? Math.round(Math.min(1, this.px[i + 2] / a) * 255) : 0;
        raw[o + 3] = Math.round(a * 255);
      }
    }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(td) >>> 0);
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(n, 0);
    ihdr.writeUInt32BE(n, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a];

const inCircle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inEllipse = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inRect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
function inPolygon(pts) {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}
function inRoundedSquare(r) {
  return (x, y) => {
    const dx = Math.max(r - x, 0, x - (1 - r));
    const dy = Math.max(r - y, 0, y - (1 - r));
    return dx * dx + dy * dy <= r * r;
  };
}
const bboxOf = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
const and = (a, b) => (x, y) => a(x, y) && b(x, y);

/**
 * The scene, in unit coordinates. `s` shrinks the art toward the centre
 * (maskable icons keep everything inside the safe zone); `clip` is the icon shape.
 */
function paint(c, s, clip) {
  const T = (x, y) => [0.5 + (x - 0.5) * s, 0.5 + (y - 0.5) * s];
  const poly = (pts, color) => {
    const tp = pts.map(([x, y]) => T(x, y));
    c.fill(color, and(clip, inPolygon(tp)), bboxOf(tp));
  };
  const circ = (x, y, r, color) => {
    const [cx, cy] = T(x, y);
    c.fill(color, and(clip, inCircle(cx, cy, r * s)), [cx - r * s, cy - r * s, cx + r * s, cy + r * s]);
  };
  const ell = (x, y, rx, ry, color) => {
    const [cx, cy] = T(x, y);
    c.fill(color, and(clip, inEllipse(cx, cy, rx * s, ry * s)), [cx - rx * s, cy - ry * s, cx + rx * s, cy + ry * s]);
  };

  c.gradient(hex('#7cc4ee'), hex('#d7f0ff'), clip); // sky
  circ(0.78, 0.22, 0.1, hex('#ffd54f'));
  ell(0.2, 0.86, 0.6, 0.3, hex('#7cb342')); // back hill
  ell(0.95, 0.9, 0.55, 0.3, hex('#689f38'));
  c.fill(hex('#8bc34a'), and(clip, inRect(0, 0.78, 1, 1)), [0, 0.78, 1, 1]); // field
  // Plowed rows in front.
  for (let i = 0; i < 3; i++) {
    const y = 0.84 + i * 0.055;
    poly([[0.06, y], [0.94, y], [0.94, y + 0.028], [0.06, y + 0.028]], hex('#6d4c41'));
  }
  // The barn: walls, roof, white trim and a cross-braced door.
  poly([[0.27, 0.48], [0.73, 0.48], [0.73, 0.8], [0.27, 0.8]], hex('#c62828'));
  poly([[0.22, 0.5], [0.5, 0.26], [0.78, 0.5], [0.72, 0.5], [0.5, 0.32], [0.28, 0.5]], hex('#fafafa'));
  poly([[0.28, 0.5], [0.5, 0.32], [0.72, 0.5]], hex('#5d4037'));
  poly([[0.4, 0.6], [0.6, 0.6], [0.6, 0.8], [0.4, 0.8]], hex('#fafafa'));
  poly([[0.425, 0.625], [0.575, 0.625], [0.575, 0.8], [0.425, 0.8]], hex('#8e1b1b'));
  poly([[0.425, 0.625], [0.445, 0.625], [0.575, 0.78], [0.575, 0.8], [0.555, 0.8], [0.425, 0.645]], hex('#fafafa'));
  poly([[0.575, 0.625], [0.555, 0.625], [0.425, 0.78], [0.425, 0.8], [0.445, 0.8], [0.575, 0.645]], hex('#fafafa'));
  poly([[0.44, 0.39], [0.56, 0.39], [0.56, 0.46], [0.44, 0.46]], hex('#fff59d'));
}

const all = () => true;

function render(size, { maskable = false, rounded = false } = {}) {
  const c = new Canvas(size);
  const clip = rounded ? inRoundedSquare(0.18) : all;
  paint(c, maskable ? 0.78 : 1, clip);
  return c.png();
}

mkdirSync(OUT, { recursive: true });
const files = {
  'icon-192.png': render(192, { rounded: true }),
  'icon-512.png': render(512, { rounded: true }),
  'maskable-512.png': render(512, { maskable: true }),
  'apple-touch-icon.png': render(180), // iOS rounds the corners itself
  'favicon-32.png': render(32, { rounded: true }),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT, name), data);
  console.log(`wrote public/icons/${name} (${data.length} bytes)`);
}
