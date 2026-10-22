/**
 * Canvas 2D painters for every generated sprite (PLAN.md section 10, art plan).
 * Each painter draws in world pixels into a sprite-sized box; the atlas builder
 * handles placement and the 2x supersampling. Colours come from artData.ts so a
 * real sprite sheet can replace any of this later without touching the views.
 */
import { GROWTH_STAGES } from '../../core';
import { TILE_HEIGHT, TILE_WIDTH } from '../iso';
import type { AnimalArt, BoxArt, CropArt, TreeArt } from './artData';

type C = CanvasRenderingContext2D;

export type CropVisual = number | 'ripe' | 'withered';

// ---------------------------------------------------------------- colour helpers

export function css(n: number, alpha = 1): string {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export function shade(n: number, f: number): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255);
}

/** Mix toward white (t > 0). */
export function tint(n: number, t: number): number {
  const ch = (v: number) => Math.round(v + (255 - v) * t);
  return (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255);
}

function ellipse(ctx: C, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rotation = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rotation, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function circle(ctx: C, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  ellipse(ctx, x, y, r, r, fill);
}

/** A soft ball: light at the top left, darker at the edge. */
function ball(ctx: C, x: number, y: number, r: number, color: number): void {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, css(tint(color, 0.35)));
  g.addColorStop(0.7, css(color));
  g.addColorStop(1, css(shade(color, 0.72)));
  circle(ctx, x, y, r, g);
}

function polygon(ctx: C, pts: readonly (readonly [number, number])[], fill: string | CanvasGradient, stroke?: string, lineWidth = 1): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function line(ctx: C, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function diamond(ctx: C, cx: number, cy: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
}

/** Deterministic pseudo-random numbers, so sprites look the same every time. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), h | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEAF = 0x4caf50;
const LEAF_DARK = 0x2e7d32;
const DEAD = 0x9c7b5f;
const DEAD_DARK = 0x6d4c41;
const OUTLINE = 'rgba(40, 26, 14, 0.55)';

// ---------------------------------------------------------------- ground

/** One grass tile: a full diamond filling the sprite, with a few tufts and the odd flower. */
export function paintGrass(ctx: C, checker: number, variant: number, w: number, h: number): void {
  const base = checker === 0 ? 0x7cb342 : 0x73a83c;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, css(tint(base, 0.06)));
  g.addColorStop(1, css(shade(base, 0.95)));
  diamond(ctx, w / 2, h / 2, w, h);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  diamond(ctx, w / 2, h / 2, w - 6, h - 3);
  ctx.clip();
  const r = rng(`grass-${checker}-${variant}`);
  for (let i = 0; i < 7; i++) {
    const x = w / 2 + (r() - 0.5) * w * 0.7;
    const y = h / 2 + (r() - 0.5) * h * 0.6;
    const c = css(r() < 0.5 ? shade(base, 0.78) : tint(base, 0.22), 0.9);
    line(ctx, x, y, x - 1.2, y - 3, c, 0.9);
    line(ctx, x + 1.2, y, x + 1.8, y - 2.6, c, 0.9);
  }
  if (variant === 2) {
    circle(ctx, w / 2 + (r() - 0.5) * 20, h / 2 + (r() - 0.5) * 8, 1, '#fff59d');
    circle(ctx, w / 2 + (r() - 0.5) * 20, h / 2 + (r() - 0.5) * 8, 1, '#ffffff');
  }
  ctx.restore();
}

export function paintSoil(ctx: C, plowed: boolean): void {
  const cx = TILE_WIDTH / 2;
  const cy = TILE_HEIGHT / 2;
  const w = TILE_WIDTH * 0.93;
  const h = TILE_HEIGHT * 0.93;
  const g = ctx.createLinearGradient(0, 0, 0, TILE_HEIGHT);
  g.addColorStop(0, plowed ? '#80594a' : '#b09583');
  g.addColorStop(1, plowed ? '#5a3d30' : '#8d7363');
  diamond(ctx, cx, cy, w, h);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  diamond(ctx, cx, cy, w, h);
  ctx.clip();
  if (plowed) {
    // Furrows along one iso axis: a lit ridge and a shadowed trough each.
    for (let i = -3; i <= 3; i++) {
      const fx = cx - i * 6;
      const fy = cy + i * 3;
      line(ctx, fx - 16, fy - 8 - 1, fx + 16, fy + 8 - 1, 'rgba(160, 120, 96, 0.55)', 1.4);
      line(ctx, fx - 16, fy - 8 + 1, fx + 16, fy + 8 + 1, 'rgba(45, 28, 20, 0.6)', 1.4);
    }
  } else {
    const r = rng('fallow');
    for (let i = 0; i < 9; i++) circle(ctx, cx + (r() - 0.5) * 36, cy + (r() - 0.5) * 16, 0.9 + r() * 0.8, 'rgba(110, 85, 70, 0.8)');
    for (let i = 0; i < 6; i++) {
      const x = cx + (r() - 0.5) * 40;
      const y = cy + (r() - 0.5) * 18;
      line(ctx, x, y, x - 1, y - 3, 'rgba(104, 159, 56, 0.9)', 1);
    }
  }
  ctx.restore();
  diamond(ctx, cx, cy, w, h);
  ctx.strokeStyle = plowed ? 'rgba(50, 30, 20, 0.8)' : 'rgba(110, 85, 70, 0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ---------------------------------------------------------------- crops

const PLANT_SPOTS: readonly (readonly [number, number])[] = [
  [-6, -6], [6, -6], [-15, 0], [15, 0], [0, 0], [-6, 6], [6, 6],
];
const VINE_SPOTS: readonly (readonly [number, number])[] = [[-10, -1], [9, -3], [0, 5]];

/** Crop textures are CROP_W x CROP_H; the tile centre sits at CROP_CY. */
export function paintCrop(ctx: C, art: CropArt, visual: CropVisual, cx: number, cy: number): void {
  const growth = visual === 'ripe' ? 1 : visual === 'withered' ? 0.8 : 0.3 + (visual / GROWTH_STAGES) * 0.6;
  const dead = visual === 'withered';
  const ripe = visual === 'ripe';
  const spots = art.style === 'vine' ? VINE_SPOTS : PLANT_SPOTS;
  for (const [dx, dy] of spots) {
    const x = cx + dx;
    const y = cy + dy;
    if (art.style === 'stalk') stalk(ctx, x, y, growth, ripe, dead, art.fruit);
    else if (art.style === 'vine') vine(ctx, x, y, growth, ripe, dead, art.fruit);
    else bush(ctx, x, y, growth, ripe, dead, art.fruit);
  }
}

function leafBlob(ctx: C, x: number, y: number, rx: number, ry: number, color: number): void {
  const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.5, 0.5, x, y, Math.max(rx, ry));
  g.addColorStop(0, css(tint(color, 0.3)));
  g.addColorStop(0.75, css(color));
  g.addColorStop(1, css(shade(color, 0.7)));
  ellipse(ctx, x, y, rx, ry, g);
}

function bush(ctx: C, x: number, y: number, f: number, ripe: boolean, dead: boolean, fruit: number): void {
  const r = 5.6 * f;
  ellipse(ctx, x, y + 0.5, r * 1.15, r * 0.45, 'rgba(0,0,0,0.18)');
  const base = dead ? DEAD : LEAF;
  const dark = dead ? DEAD_DARK : LEAF_DARK;
  leafBlob(ctx, x - r * 0.5, y - r * 0.45, r * 0.75, r * 0.6, dark);
  leafBlob(ctx, x + r * 0.5, y - r * 0.5, r * 0.75, r * 0.6, dark);
  leafBlob(ctx, x, y - r * 0.85, r * 0.85, r * 0.7, base);
  if (ripe) {
    for (const [fx, fy, s] of [[-2.4, -0.55, 1], [2.6, -0.95, 1], [0.4, -0.15, 0.9]] as const) ball(ctx, x + fx, y + fy * r, 1.9 * s, fruit);
  } else if (dead) {
    line(ctx, x - r * 0.6, y - r * 0.3, x - r, y + 0.5, css(DEAD_DARK), 0.8);
  }
}

function stalk(ctx: C, x: number, y: number, f: number, ripe: boolean, dead: boolean, fruit: number): void {
  const h = 17 * f;
  ellipse(ctx, x, y + 0.5, 3.5, 1.4, 'rgba(0,0,0,0.18)');
  const stem = dead ? css(DEAD) : ripe ? css(mixColor(LEAF, fruit, 0.55)) : css(LEAF);
  for (const ox of [-2, 0, 2]) {
    const lean = dead ? ox * 2.6 + 1.5 : ox * 0.7;
    ctx.beginPath();
    ctx.moveTo(x + ox * 0.5, y);
    ctx.quadraticCurveTo(x + ox * 0.5 + lean * 0.3, y - h * 0.6, x + lean, y - h);
    ctx.strokeStyle = stem;
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.stroke();
    // A leaf halfway up.
    if (!dead) ellipse(ctx, x + ox * 0.5 + (ox >= 0 ? 1.6 : -1.6), y - h * 0.45, 2.2, 0.8, css(LEAF_DARK), ox >= 0 ? -0.6 : 0.6);
  }
  if (ripe) {
    for (const ox of [-2, 0, 2]) {
      const hx = x + ox * 0.7;
      const g = ctx.createLinearGradient(hx - 1.5, 0, hx + 1.5, 0);
      g.addColorStop(0, css(tint(fruit, 0.25)));
      g.addColorStop(1, css(shade(fruit, 0.8)));
      ellipse(ctx, hx, y - h - 1, 1.6, 3.2, g);
    }
  } else if (dead) {
    ellipse(ctx, x + 3, y - h + 1, 1.6, 2.4, css(DEAD_DARK), 0.6);
  }
}

function vine(ctx: C, x: number, y: number, f: number, ripe: boolean, dead: boolean, fruit: number): void {
  ellipse(ctx, x, y + 1, 9 * f, 3 * f, 'rgba(0,0,0,0.18)');
  const color = dead ? DEAD : LEAF_DARK;
  for (const side of [-1, 1]) {
    leafBlob(ctx, x + side * 4.5 * f, y - 1, 5 * f, 2.8 * f, color);
    line(ctx, x, y - 1, x + side * 7 * f, y - 1.6, css(shade(color, 0.6)), 0.6);
  }
  if (ripe || dead) {
    const body = dead ? DEAD : fruit;
    const g = ctx.createRadialGradient(x - 2, y - 6, 0.5, x, y - 3, 6.5);
    g.addColorStop(0, css(tint(body, 0.35)));
    g.addColorStop(1, css(shade(body, 0.75)));
    ellipse(ctx, x, y - 3, 6, 4.2, g);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y - 3, 6, 4.2, 0, 0, Math.PI * 2);
    ctx.clip();
    for (const sx of [-3, 0, 3]) line(ctx, x + sx, y - 7, x + sx * 1.3, y + 1, css(shade(body, 0.7), 0.6), 0.8);
    ctx.restore();
    ellipse(ctx, x - 2, y - 5, 1.6, 0.9, 'rgba(255,255,255,0.45)');
  } else {
    circle(ctx, x + 1, y - 2.5, 1.5 * f + 0.4, '#fff59d');
  }
}

function mixColor(a: number, b: number, t: number): number {
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * t);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ---------------------------------------------------------------- trees

type TreeShape = 'round' | 'tall' | 'palm';

const TREE_SHAPES: Readonly<Record<string, TreeShape>> = {
  pear_tree: 'tall',
  olive_tree: 'tall',
  fig_tree: 'round',
  coconut_palm: 'palm',
  banana_tree: 'palm',
};

/** Trees and animals are TALL_W x TALL_H; the tile centre sits at (cx, base). */
export function paintTree(ctx: C, itemId: string, art: TreeArt, ready: boolean, cx: number, base: number): void {
  const shape = TREE_SHAPES[itemId] ?? 'round';
  ellipse(ctx, cx, base + 2, 17, 6, 'rgba(0,0,0,0.2)');
  if (shape === 'palm') return palm(ctx, art, ready, cx, base);

  // Trunk, slightly tapered, lit from the left.
  const tg = ctx.createLinearGradient(cx - 4, 0, cx + 4, 0);
  tg.addColorStop(0, '#8d6e63');
  tg.addColorStop(1, '#5d4037');
  polygon(ctx, [[cx - 3.8, base], [cx + 3.8, base], [cx + 2.4, base - 34], [cx - 2.4, base - 34]], tg);
  line(ctx, cx, base - 26, cx + 7, base - 33, '#6d4c41', 2);

  const r = rng(`${itemId}-canopy`);
  const blobs: [number, number, number][] =
    shape === 'tall'
      ? [[0, -40, 11], [-6, -48, 10], [6, -50, 10], [0, -60, 10], [-3, -68, 7]]
      : [[-10, -40, 12], [10, -40, 12], [0, -50, 16], [-8, -56, 11], [9, -57, 11]];
  // Back layer darker, then the front, then a light dappling.
  for (const [dx, dy, rad] of blobs) circle(ctx, cx + dx, base + dy + 2, rad, css(shade(art.canopy, 0.72)));
  for (const [dx, dy, rad] of blobs) ball(ctx, cx + dx, base + dy, rad * 0.92, art.canopy);
  for (let i = 0; i < 7; i++) circle(ctx, cx + (r() - 0.5) * 26, base - 44 - r() * 18, 1.5 + r() * 2, css(tint(art.canopy, 0.3), 0.55));
  if (ready) {
    const spots =
      shape === 'tall'
        ? [[-6, -42], [5, -46], [-3, -55], [6, -58], [0, -66], [-7, -50]]
        : [[-12, -40], [9, -44], [-2, -54], [13, -36], [-6, -32], [4, -60], [0, -42]];
    for (const [dx, dy] of spots) ball(ctx, cx + dx!, base + dy!, 3, art.fruit);
  }
}

function palm(ctx: C, art: TreeArt, ready: boolean, cx: number, base: number): void {
  // A curved, ringed trunk.
  ctx.beginPath();
  ctx.moveTo(cx - 3, base);
  ctx.quadraticCurveTo(cx - 6, base - 30, cx + 2, base - 58);
  ctx.lineTo(cx + 6, base - 57);
  ctx.quadraticCurveTo(cx - 1, base - 30, cx + 3, base);
  ctx.closePath();
  ctx.fillStyle = '#8d6e63';
  ctx.fill();
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const x = cx - 3 * Math.sin(t * Math.PI) + t * 5;
    line(ctx, x - 3, base - t * 57, x + 3, base - t * 57 - 1, '#6d4c41', 0.8);
  }
  const top = { x: cx + 4, y: base - 58 };
  // Fronds: long leaves fanning out and drooping, darker ones behind.
  const fronds = [-2.8, -2.3, -1.85, -1.3, -0.8, -0.3, 0.25, 2.95];
  fronds.forEach((angle, i) => {
    const droop = Math.abs(Math.cos(angle)) * 5;
    const mx = top.x + Math.cos(angle) * 11;
    const my = top.y + Math.sin(angle) * 6 + droop;
    const color = i % 2 ? shade(art.canopy, 0.8) : art.canopy;
    ellipse(ctx, mx, my, 12, 3.6, css(color), Math.atan2(Math.sin(angle) * 6 + droop * 2, Math.cos(angle) * 11));
    line(ctx, top.x, top.y, mx + Math.cos(angle) * 9, my + Math.sin(angle) * 4 + droop, css(shade(art.canopy, 0.6)), 0.6);
  });
  if (ready) for (const [dx, dy] of [[-2, 2], [3, 3], [0, 5]] as const) ball(ctx, top.x + dx, top.y + dy, 3, art.fruit);
}

// ---------------------------------------------------------------- animals

type Species = 'bird' | 'quad' | 'sheep' | 'pig' | 'rabbit';

const SPECIES: Readonly<Record<string, Species>> = {
  chicken: 'bird',
  duck: 'bird',
  goose: 'bird',
  turkey: 'bird',
  sheep: 'sheep',
  llama: 'quad',
  pig: 'pig',
  rabbit: 'rabbit',
};

export function paintAnimal(ctx: C, itemId: string, art: AnimalArt, cx: number, base: number): void {
  const k = art.size;
  ellipse(ctx, cx, base + 1, 13 * k, 4.5 * k, 'rgba(0,0,0,0.2)');
  switch (SPECIES[itemId] ?? 'quad') {
    case 'bird':
      return bird(ctx, itemId, art, cx, base, k);
    case 'sheep':
      return sheep(ctx, art, cx, base, k);
    case 'pig':
      return pig(ctx, art, cx, base, k);
    case 'rabbit':
      return rabbit(ctx, art, cx, base, k);
    case 'quad':
      return quad(ctx, itemId, art, cx, base, k);
  }
}

function eye(ctx: C, x: number, y: number, r = 1.1): void {
  circle(ctx, x, y, r, '#212121');
  circle(ctx, x + r * 0.35, y - r * 0.35, r * 0.35, '#ffffff');
}

function bird(ctx: C, id: string, art: AnimalArt, cx: number, base: number, k: number): void {
  const legs = id === 'chicken' || id === 'turkey' ? '#f9a825' : '#ff9800';
  line(ctx, cx - 2 * k, base - 6 * k, cx - 2.5 * k, base, legs, 1.2);
  line(ctx, cx + 2 * k, base - 6 * k, cx + 2.5 * k, base, legs, 1.2);
  if (id === 'turkey') {
    // Tail fan behind the body.
    for (let i = -3; i <= 3; i++) {
      const a = -Math.PI / 2 + i * 0.32 - 0.5;
      ellipse(ctx, cx - 4 * k + Math.cos(a) * 9 * k, base - 14 * k + Math.sin(a) * 9 * k, 3.4 * k, 6 * k, css(i % 2 ? 0xa1887f : 0x8d6e63), a + Math.PI / 2);
    }
  }
  const body = art.body;
  const bodyG = ctx.createRadialGradient(cx - 3 * k, base - 13 * k, 1, cx, base - 10 * k, 11 * k);
  bodyG.addColorStop(0, css(tint(body, 0.25)));
  bodyG.addColorStop(1, css(shade(body, 0.82)));
  ellipse(ctx, cx, base - 10 * k, 9 * k, 6.5 * k, bodyG);
  // Wing.
  ellipse(ctx, cx - 1 * k, base - 10 * k, 5 * k, 3.2 * k, css(shade(body, 0.86)), -0.2);
  if (id === 'chicken') polygon(ctx, [[cx - 8 * k, base - 12 * k], [cx - 12 * k, base - 18 * k], [cx - 6 * k, base - 14 * k]], css(shade(body, 0.85)));
  const neckUp = id === 'goose' ? 9 : 4;
  const hx = cx + 7 * k;
  const hy = base - (14 + neckUp) * k;
  if (id === 'goose') ellipse(ctx, cx + 6 * k, base - 15 * k, 2.4 * k, 6 * k, css(body), 0.2);
  circle(ctx, hx, hy, 4.2 * k, css(id === 'turkey' ? 0xd7ccc8 : body));
  if (id === 'chicken') {
    for (const dx of [-1.6, 0, 1.6]) circle(ctx, hx + dx * k, hy - 4 * k, 1.5 * k, css(art.accent));
    circle(ctx, hx + 2.5 * k, hy + 2.6 * k, 1.1 * k, css(art.accent));
  }
  if (id === 'turkey') ellipse(ctx, hx + 2.5 * k, hy + 3 * k, 1 * k, 2.2 * k, css(art.accent));
  const billLong = id === 'duck' || id === 'goose';
  polygon(
    ctx,
    [[hx + 3.4 * k, hy - 0.8 * k], [hx + (billLong ? 8 : 6.4) * k, hy + 0.3 * k], [hx + 3.4 * k, hy + 1.4 * k]],
    css(billLong ? art.accent : 0xffb300),
  );
  eye(ctx, hx + 1 * k, hy - 1 * k);
}

function quad(ctx: C, id: string, art: AnimalArt, cx: number, base: number, k: number): void {
  const body = art.body;
  const legC = css(shade(body, 0.62));
  for (const dx of [-8, -4.5, 4.5, 8]) {
    polygon(ctx, [[cx + dx * k - 1.4, base - 8 * k], [cx + dx * k + 1.4, base - 8 * k], [cx + dx * k + 1.2, base], [cx + dx * k - 1.2, base]], legC);
    ellipse(ctx, cx + dx * k, base, 1.6, 0.8, '#3e2723');
  }
  // Tail.
  line(ctx, cx - 11 * k, base - 15 * k, cx - 13 * k, base - 8 * k, css(id === 'horse' ? art.accent : shade(body, 0.6)), id === 'horse' ? 2.4 : 1.2);
  const g = ctx.createLinearGradient(0, base - 20 * k, 0, base - 7 * k);
  g.addColorStop(0, css(tint(body, 0.2)));
  g.addColorStop(1, css(shade(body, 0.78)));
  ctx.beginPath();
  ctx.roundRect(cx - 12 * k, base - 19 * k, 22 * k, 12 * k, 6 * k);
  ctx.fillStyle = g;
  ctx.fill();
  if (art.spots !== undefined) {
    const r = rng(`${id}-spots`);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx - 12 * k, base - 19 * k, 22 * k, 12 * k, 6 * k);
    ctx.clip();
    for (let i = 0; i < 4; i++) ellipse(ctx, cx + (r() - 0.5) * 18 * k, base - 13 * k + (r() - 0.5) * 8 * k, (2.5 + r() * 2) * k, (1.8 + r()) * k, css(art.spots));
    ctx.restore();
  }
  // Neck and head (the llama's neck is long and upright).
  const llama = id === 'llama';
  const neckTop = llama ? base - 34 * k : base - 22 * k;
  const hx = llama ? cx + 9 * k : cx + 12 * k;
  polygon(ctx, [[cx + 6 * k, base - 17 * k], [cx + 10 * k, base - 18 * k], [hx + 2 * k, neckTop + 3 * k], [hx - 3 * k, neckTop + 2 * k]], css(shade(body, 0.92)));
  const headW = id === 'horse' || id === 'donkey' ? 4 : 4.6;
  ellipse(ctx, hx + 1.5 * k, neckTop + 2 * k, headW * 1.25 * k, 3.6 * k, css(body), 0.35);
  if (id === 'horse') for (let i = 0; i < 4; i++) ellipse(ctx, cx + (7 + i * 1.5) * k, base - (19 + i * 1.6) * k, 1.6 * k, 2.4 * k, css(art.accent), 0.6);
  // Muzzle, ears, horns.
  ellipse(ctx, hx + 5 * k, neckTop + 3.4 * k, 2.4 * k, 2 * k, css(id === 'cow' ? art.accent : shade(body, 0.8)));
  const earLong = id === 'donkey' || id === 'llama';
  ellipse(ctx, hx - 1.5 * k, neckTop - (earLong ? 3.5 : 1.5) * k, 1.2 * k, (earLong ? 3.4 : 1.8) * k, css(shade(body, 0.75)), -0.3);
  if (id === 'cow' || id === 'goat') {
    line(ctx, hx, neckTop - 1.4 * k, hx - 1 * k, neckTop - 4.6 * k, id === 'goat' ? '#8d6e63' : '#eeeeee', 1.4);
  }
  if (id === 'goat') line(ctx, hx + 4 * k, neckTop + 5 * k, hx + 3.6 * k, neckTop + 8 * k, css(shade(body, 0.6)), 1.6);
  eye(ctx, hx + 2 * k, neckTop + 0.6 * k);
}

function sheep(ctx: C, art: AnimalArt, cx: number, base: number, k: number): void {
  for (const dx of [-6, -3, 3, 6]) line(ctx, cx + dx * k, base - 7 * k, cx + dx * k, base, '#424242', 2);
  const r = rng('sheep');
  const wool = art.body;
  const puffs: [number, number][] = [[-7, -12], [-2, -16], [4, -15], [7, -11], [0, -10], [-4, -9], [5, -8]];
  for (const [dx, dy] of puffs) circle(ctx, cx + dx * k, base + dy * k + 1, 5 * k, css(shade(wool, 0.8)));
  for (const [dx, dy] of puffs) ball(ctx, cx + dx * k, base + dy * k, (4.4 + r()) * k, wool);
  ellipse(ctx, cx + 11 * k, base - 14 * k, 3.6 * k, 3 * k, css(art.accent), 0.3);
  ellipse(ctx, cx + 8.6 * k, base - 16 * k, 1.6 * k, 1 * k, css(art.accent), -0.6);
  eye(ctx, cx + 12 * k, base - 15 * k, 0.9);
}

function pig(ctx: C, art: AnimalArt, cx: number, base: number, k: number): void {
  for (const dx of [-6, -3, 3, 6]) line(ctx, cx + dx * k, base - 6 * k, cx + dx * k, base, css(shade(art.body, 0.75)), 2.4);
  const g = ctx.createRadialGradient(cx - 3 * k, base - 14 * k, 1, cx, base - 11 * k, 13 * k);
  g.addColorStop(0, css(tint(art.body, 0.3)));
  g.addColorStop(1, css(shade(art.body, 0.82)));
  ellipse(ctx, cx, base - 11 * k, 11 * k, 7.5 * k, g);
  ctx.beginPath();
  ctx.arc(cx - 11.5 * k, base - 13 * k, 2 * k, 0, Math.PI * 1.6);
  ctx.strokeStyle = css(shade(art.body, 0.7));
  ctx.lineWidth = 1;
  ctx.stroke();
  polygon(ctx, [[cx + 5 * k, base - 17 * k], [cx + 7 * k, base - 22 * k], [cx + 9 * k, base - 16.5 * k]], css(shade(art.body, 0.85)));
  ellipse(ctx, cx + 11 * k, base - 11 * k, 2.6 * k, 2.2 * k, css(art.accent));
  circle(ctx, cx + 10.4 * k, base - 11 * k, 0.5 * k, '#6d1b3b');
  circle(ctx, cx + 11.8 * k, base - 11 * k, 0.5 * k, '#6d1b3b');
  eye(ctx, cx + 7.5 * k, base - 14 * k, 0.9);
}

function rabbit(ctx: C, art: AnimalArt, cx: number, base: number, k: number): void {
  ball(ctx, cx - 1 * k, base - 8 * k, 7.5 * k, art.body);
  circle(ctx, cx - 8 * k, base - 8 * k, 2.4 * k, '#ffffff');
  ball(ctx, cx + 6 * k, base - 14 * k, 4.8 * k, art.body);
  ellipse(ctx, cx + 4 * k, base - 22 * k, 1.7 * k, 5 * k, css(art.body), -0.25);
  ellipse(ctx, cx + 7.5 * k, base - 22.5 * k, 1.7 * k, 5 * k, css(art.body), 0.2);
  ellipse(ctx, cx + 7.5 * k, base - 22.5 * k, 0.8 * k, 3.6 * k, '#f8bbd0', 0.2);
  eye(ctx, cx + 8 * k, base - 15 * k, 0.9);
}

// ---------------------------------------------------------------- buildings & decorations

export interface BoxGeometry {
  /** Footprint in tiles (after rotation). */
  w: number;
  h: number;
  art: BoxArt;
  /** Grid point (a, b) at height `lift` -> sprite coordinates. Applies the art's inset. */
  pt: (a: number, b: number, lift: number) => { x: number; y: number };
  /** Same without the inset (the full footprint). */
  ptFull: (a: number, b: number, lift: number) => { x: number; y: number };
}

/** The geometry shared by box-style sprites: texture size and corner projection. */
export function boxGeometry(w: number, h: number, art: BoxArt): { width: number; height: number; geo: BoxGeometry } {
  const top = art.height + (art.roofHeight ?? 0);
  const width = ((w + h) * TILE_WIDTH) / 2;
  const height = ((w + h) * TILE_HEIGHT) / 2 + top;
  const make = (inset: number) => (a: number, b: number, lift: number) => {
    const ia = w / 2 + (a - w / 2) * inset;
    const ib = h / 2 + (b - h / 2) * inset;
    return { x: ((ia - ib) * TILE_WIDTH) / 2 + (h * TILE_WIDTH) / 2, y: ((ia + ib) * TILE_HEIGHT) / 2 + top - lift };
  };
  return { width, height, geo: { w, h, art, pt: make(art.inset), ptFull: make(1) } };
}

type XY = { x: number; y: number };
const xy = (p: XY): [number, number] => [p.x, p.y];

/** Painter for one decoration or building id; falls back to a detailed box. */
export function paintItem(ctx: C, itemId: string, geo: BoxGeometry, isBuilding: boolean): void {
  const special = SPECIAL[itemId];
  if (special) return special(ctx, geo);
  paintBox(ctx, geo, isBuilding ? itemId : null);
}

/** Walls, top and an optional pyramid roof; buildings get a door and windows. */
function paintBox(ctx: C, geo: BoxGeometry, buildingId: string | null): void {
  const { w, h, art, pt } = geo;
  const wall = art.height;
  ellipse(ctx, pt(w / 2, h / 2, 0).x, pt(w / 2, h / 2, 0).y + 1, ((w + h) * TILE_WIDTH) / 4 * art.inset, ((w + h) * TILE_HEIGHT) / 4 * art.inset, 'rgba(0,0,0,0.16)');
  const L = pt(0, h, 0);
  const B = pt(w, h, 0);
  const R = pt(w, 0, 0);
  const lg = ctx.createLinearGradient(0, L.y - wall, 0, B.y);
  lg.addColorStop(0, css(tint(art.left, 0.08)));
  lg.addColorStop(1, css(shade(art.left, 0.88)));
  polygon(ctx, [xy(L), xy(B), xy(pt(w, h, wall)), xy(pt(0, h, wall))], lg, OUTLINE, 0.8);
  const rg = ctx.createLinearGradient(0, R.y - wall, 0, B.y);
  rg.addColorStop(0, css(tint(art.right, 0.05)));
  rg.addColorStop(1, css(shade(art.right, 0.85)));
  polygon(ctx, [xy(B), xy(R), xy(pt(w, 0, wall)), xy(pt(w, h, wall))], rg, OUTLINE, 0.8);
  const tg = ctx.createLinearGradient(pt(0, 0, wall).x, pt(0, 0, wall).y, pt(w, h, wall).x, pt(w, h, wall).y);
  tg.addColorStop(0, css(tint(art.top, 0.18)));
  tg.addColorStop(1, css(shade(art.top, 0.92)));
  polygon(ctx, [xy(pt(0, 0, wall)), xy(pt(w, 0, wall)), xy(pt(w, h, wall)), xy(pt(0, h, wall))], tg, OUTLINE, 0.8);

  if (buildingId && wall >= 10) {
    // A door on the left face, windows on the right face.
    const face = (a: number, b: number, lift: number) => pt(a, b, lift);
    const doorW = Math.min(0.32, 0.5 / w);
    const da = w / 2 - doorW * w;
    const db = w / 2 + doorW * w;
    const doorTop = Math.min(wall - 3, 14);
    polygon(ctx, [xy(face(da, h, 0)), xy(face(db, h, 0)), xy(face(db, h, doorTop)), xy(face(da, h, doorTop))], css(shade(art.left, 0.55)), OUTLINE, 0.6);
    if (buildingId === 'barn' || buildingId === 'stable' || buildingId === 'dairy_farm') {
      line(ctx, face(da, h, 0).x, face(da, h, 0).y, face(db, h, doorTop).x, face(db, h, doorTop).y, 'rgba(255,255,255,0.7)', 0.8);
      line(ctx, face(db, h, 0).x, face(db, h, 0).y, face(da, h, doorTop).x, face(da, h, doorTop).y, 'rgba(255,255,255,0.7)', 0.8);
    }
    if (buildingId === 'garage') {
      for (let i = 1; i < 5; i++) {
        const y = (doorTop * i) / 5;
        line(ctx, face(da, h, y).x, face(da, h, y).y, face(db, h, y).x, face(db, h, y).y, 'rgba(255,255,255,0.35)', 0.6);
      }
    }
    for (const t of h >= 2 ? [0.3, 0.7] : [0.5]) {
      const b = h * t;
      const win = [xy(face(w, b - 0.16, wall * 0.42)), xy(face(w, b + 0.16, wall * 0.42)), xy(face(w, b + 0.16, wall * 0.72)), xy(face(w, b - 0.16, wall * 0.72))] as [number, number][];
      polygon(ctx, win, '#b3e5fc', 'rgba(255,255,255,0.9)', 0.8);
    }
  }

  if (art.roof !== undefined && (art.roofHeight ?? 0) > 0) {
    const over = 1.08;
    const r = (a: number, b: number) => pt(w / 2 + (a - w / 2) * over, h / 2 + (b - h / 2) * over, wall);
    const apex = pt(w / 2, h / 2, wall + (art.roofHeight ?? 0));
    polygon(ctx, [xy(r(0, h)), xy(r(w, h)), xy(apex)], css(shade(art.roof, 0.95)), OUTLINE, 0.8);
    polygon(ctx, [xy(r(w, h)), xy(r(w, 0)), xy(apex)], css(shade(art.roof, 0.72)), OUTLINE, 0.8);
    // Shingle lines on the front face.
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      const a = r(0, h);
      const b = r(w, h);
      line(ctx, a.x + (apex.x - a.x) * t, a.y + (apex.y - a.y) * t, b.x + (apex.x - b.x) * t, b.y + (apex.y - b.y) * t, css(shade(art.roof, 0.75), 0.7), 0.6);
    }
  }
}

/** A flat inset diamond on the ground (paths, ponds, flower beds). */
function groundPatch(ctx: C, geo: BoxGeometry, inset: number, fill: string | CanvasGradient, lift = 0): void {
  const { w, h } = geo;
  const p = (a: number, b: number) => geo.ptFull(w / 2 + (a - w / 2) * inset, h / 2 + (b - h / 2) * inset, lift);
  polygon(ctx, [xy(p(0, 0)), xy(p(w, 0)), xy(p(w, h)), xy(p(0, h))], fill);
}

function center(geo: BoxGeometry, lift = 0): XY {
  return geo.ptFull(geo.w / 2, geo.h / 2, lift);
}

function fence(ctx: C, geo: BoxGeometry, color: number): void {
  // Posts and two rails along the tile's front edge diagonal.
  const a = geo.ptFull(0.1, 0.5, 0);
  const b = geo.ptFull(0.9, 0.5, 0);
  const posts = [0, 0.5, 1].map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
  for (const lift of [5, 9.5]) line(ctx, posts[0]!.x, posts[0]!.y - lift, posts[2]!.x, posts[2]!.y - lift, css(shade(color, 0.92)), 1.8);
  for (const p of posts) {
    polygon(ctx, [[p.x - 1.3, p.y], [p.x + 1.3, p.y], [p.x + 1.3, p.y - 12], [p.x, p.y - 13.5], [p.x - 1.3, p.y - 12]], css(color), OUTLINE, 0.5);
  }
}

function flowers(ctx: C, geo: BoxGeometry, colors: number[], seed: string): void {
  const r = rng(seed);
  groundPatch(ctx, geo, 0.8, '#6d4c41');
  const c = center(geo);
  for (let i = 0; i < 14; i++) {
    const x = c.x + (r() - 0.5) * 34 * geo.art.inset;
    const y = c.y + (r() - 0.5) * 14 * geo.art.inset;
    line(ctx, x, y + 2, x, y - 2, '#388e3c', 1);
    ball(ctx, x, y - 3, 1.8, colors[i % colors.length]!);
  }
}

function pole(ctx: C, x: number, y: number, height: number, color: string, width = 2): void {
  line(ctx, x, y, x, y - height, color, width);
}

const SPECIAL: Readonly<Record<string, (ctx: C, geo: BoxGeometry) => void>> = {
  white_fence: (ctx, g) => fence(ctx, g, 0xfafafa),
  wooden_fence: (ctx, g) => fence(ctx, g, 0xa1704a),
  stone_path: (ctx, g) => {
    const r = rng('path');
    const c = center(g);
    for (let i = 0; i < 6; i++) {
      const x = c.x + (r() - 0.5) * 34;
      const y = c.y + (r() - 0.5) * 14;
      ellipse(ctx, x, y + 0.8, 5 + r() * 2, 2.6 + r(), '#8d8a84');
      ellipse(ctx, x, y, 5 + r() * 2, 2.6 + r(), css(tint(0xb0aca5, r() * 0.2)));
    }
  },
  flower_bed: (ctx, g) => flowers(ctx, g, [0xec407a, 0xfff176, 0xba68c8], 'flowers'),
  tulip_bed: (ctx, g) => flowers(ctx, g, [0xff7043, 0xffca28, 0xef5350], 'tulips'),
  hay_bale: (ctx, g) => {
    paintBox(ctx, g, null);
    const { w, h, art, pt } = g;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      const a = pt(w * t, h, 0);
      const b = pt(w * t, h, art.height);
      line(ctx, a.x, a.y, b.x, b.y, 'rgba(160, 120, 40, 0.6)', 0.7);
    }
  },
  scarecrow: (ctx, g) => {
    const c = center(g);
    pole(ctx, c.x, c.y, 24, '#6d4c41', 2);
    line(ctx, c.x - 9, c.y - 16, c.x + 9, c.y - 16, '#6d4c41', 2);
    polygon(ctx, [[c.x - 6, c.y - 18], [c.x + 6, c.y - 18], [c.x + 4, c.y - 8], [c.x - 4, c.y - 8]], '#1e88e5', OUTLINE, 0.6);
    ball(ctx, c.x, c.y - 21, 3.4, 0xffe0b2);
    polygon(ctx, [[c.x - 6, c.y - 23], [c.x + 6, c.y - 23], [c.x, c.y - 29]], '#fdd835', OUTLINE, 0.6);
  },
  mailbox: (ctx, g) => {
    const c = center(g);
    pole(ctx, c.x, c.y, 12, '#6d4c41', 2);
    ctx.beginPath();
    ctx.roundRect(c.x - 5, c.y - 18, 10, 6, 3);
    ctx.fillStyle = '#1e88e5';
    ctx.fill();
    polygon(ctx, [[c.x + 4, c.y - 18], [c.x + 5, c.y - 18], [c.x + 5, c.y - 23], [c.x + 8, c.y - 22], [c.x + 5, c.y - 21]], '#e53935');
  },
  lamp_post: (ctx, g) => {
    const c = center(g);
    pole(ctx, c.x, c.y, 34, '#37474f', 2.2);
    const glow = ctx.createRadialGradient(c.x, c.y - 37, 0, c.x, c.y - 37, 9);
    glow.addColorStop(0, 'rgba(255, 245, 157, 0.9)');
    glow.addColorStop(1, 'rgba(255, 245, 157, 0)');
    circle(ctx, c.x, c.y - 37, 9, glow);
    polygon(ctx, [[c.x - 3.5, c.y - 34], [c.x + 3.5, c.y - 34], [c.x + 2.5, c.y - 40], [c.x - 2.5, c.y - 40]], '#fff59d', '#37474f', 0.8);
  },
  birdhouse: (ctx, g) => {
    const c = center(g);
    pole(ctx, c.x, c.y, 14, '#6d4c41', 2);
    polygon(ctx, [[c.x - 5, c.y - 14], [c.x + 5, c.y - 14], [c.x + 5, c.y - 21], [c.x - 5, c.y - 21]], '#8d6e63', OUTLINE, 0.6);
    polygon(ctx, [[c.x - 7, c.y - 21], [c.x + 7, c.y - 21], [c.x, c.y - 26]], '#c62828', OUTLINE, 0.6);
    circle(ctx, c.x, c.y - 17.5, 1.5, '#3e2723');
  },
  rose_bush: (ctx, g) => {
    const c = center(g);
    for (const [dx, dy, r] of [[-5, -5, 6], [5, -6, 6], [0, -10, 7]] as const) ball(ctx, c.x + dx, c.y + dy, r, 0x388e3c);
    for (const [dx, dy] of [[-5, -8], [4, -10], [0, -14], [6, -4], [-2, -4]] as const) ball(ctx, c.x + dx, c.y + dy, 1.8, 0xd81b60);
  },
  hedge: (ctx, g) => {
    paintBox(ctx, g, null);
    const r = rng('hedge');
    const c = center(g, g.art.height);
    for (let i = 0; i < 8; i++) circle(ctx, c.x + (r() - 0.5) * 30, c.y + (r() - 0.5) * 10, 1.5 + r() * 2, 'rgba(165, 214, 167, 0.5)');
  },
  fountain: (ctx, g) => {
    const c = center(g);
    ellipse(ctx, c.x, c.y, 26, 12, '#bdbdbd');
    ellipse(ctx, c.x, c.y - 2, 23, 10, '#64b5f6');
    pole(ctx, c.x, c.y - 2, 14, '#9e9e9e', 3);
    ellipse(ctx, c.x, c.y - 16, 8, 3, '#bdbdbd');
    for (const dx of [-6, 0, 6]) line(ctx, c.x, c.y - 18, c.x + dx * 1.6, c.y - 6, 'rgba(225, 245, 254, 0.8)', 1);
  },
  birdbath: (ctx, g) => {
    const c = center(g);
    polygon(ctx, [[c.x - 2.5, c.y], [c.x + 2.5, c.y], [c.x + 1.5, c.y - 12], [c.x - 1.5, c.y - 12]], '#bdbdbd');
    ellipse(ctx, c.x, c.y - 13, 9, 3.6, '#9e9e9e');
    ellipse(ctx, c.x, c.y - 13.6, 7, 2.6, '#90caf9');
  },
  lily_pond: (ctx, g) => pond(ctx, g, 'lily'),
  duck_pond: (ctx, g) => pond(ctx, g, 'reeds'),
  wishing_well: (ctx, g) => {
    const c = center(g);
    ellipse(ctx, c.x, c.y - 1, 10, 5, '#757575');
    polygon(ctx, [[c.x - 10, c.y - 1], [c.x + 10, c.y - 1], [c.x + 10, c.y - 9], [c.x - 10, c.y - 9]], '#9e9e9e', OUTLINE, 0.6);
    ellipse(ctx, c.x, c.y - 9, 10, 5, '#455a64');
    pole(ctx, c.x - 9, c.y - 8, 14, '#6d4c41', 1.6);
    pole(ctx, c.x + 9, c.y - 8, 14, '#6d4c41', 1.6);
    polygon(ctx, [[c.x - 12, c.y - 21], [c.x + 12, c.y - 21], [c.x, c.y - 29]], '#8d6e63', OUTLINE, 0.6);
  },
  windmill: (ctx, g) => {
    paintBox(ctx, g, null);
    const c = center(g, g.art.height + (g.art.roofHeight ?? 0) * 0.5);
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + 0.35;
      const ex = c.x + Math.cos(a) * 24;
      const ey = c.y + Math.sin(a) * 24;
      polygon(ctx, [[c.x, c.y], [ex + Math.cos(a + 1.4) * 3, ey + Math.sin(a + 1.4) * 3], [ex, ey]], '#fafafa', OUTLINE, 0.6);
    }
    circle(ctx, c.x, c.y, 2.4, '#5d4037');
  },
  flag_pole: (ctx, g) => {
    const c = center(g);
    pole(ctx, c.x, c.y, 46, '#9e9e9e', 1.8);
    ctx.beginPath();
    ctx.moveTo(c.x + 1, c.y - 45);
    ctx.quadraticCurveTo(c.x + 8, c.y - 47, c.x + 15, c.y - 44);
    ctx.lineTo(c.x + 15, c.y - 36);
    ctx.quadraticCurveTo(c.x + 8, c.y - 39, c.x + 1, c.y - 37);
    ctx.closePath();
    ctx.fillStyle = '#e53935';
    ctx.fill();
  },
  lighthouse: (ctx, g) => {
    const c = center(g);
    const H = g.art.height;
    ellipse(ctx, c.x, c.y, 16, 7, '#9e9e9e');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c.x - 11, c.y);
    ctx.lineTo(c.x + 11, c.y);
    ctx.lineTo(c.x + 6, c.y - H);
    ctx.lineTo(c.x - 6, c.y - H);
    ctx.closePath();
    ctx.clip();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#e53935' : '#fafafa';
      ctx.fillRect(c.x - 12, c.y - H + (i * H) / 5, 24, H / 5 + 0.5);
    }
    ctx.restore();
    polygon(ctx, [[c.x - 11, c.y], [c.x + 11, c.y], [c.x + 6, c.y - H], [c.x - 6, c.y - H]], 'rgba(0,0,0,0)', OUTLINE, 0.8);
    polygon(ctx, [[c.x - 6, c.y - H], [c.x + 6, c.y - H], [c.x + 6, c.y - H - 7], [c.x - 6, c.y - H - 7]], '#fff59d', OUTLINE, 0.6);
    polygon(ctx, [[c.x - 8, c.y - H - 7], [c.x + 8, c.y - H - 7], [c.x, c.y - H - 15]], '#c62828', OUTLINE, 0.6);
  },
  gazebo: (ctx, g) => {
    const { w, h, art, pt } = g;
    groundPatch(ctx, g, 0.8, '#d7ccc8', 2);
    for (const [a, b] of [[0, 0], [w, 0], [w, h], [0, h]] as const) {
      const p = pt(a, b, 0);
      pole(ctx, p.x, p.y, art.height, '#fafafa', 2);
    }
    const over = 1.12;
    const r = (a: number, b: number) => pt(w / 2 + (a - w / 2) * over, h / 2 + (b - h / 2) * over, art.height);
    const apex = pt(w / 2, h / 2, art.height + (art.roofHeight ?? 0));
    polygon(ctx, [xy(r(0, h)), xy(r(w, h)), xy(apex)], css(art.roof ?? 0x2e7d32), OUTLINE, 0.8);
    polygon(ctx, [xy(r(w, h)), xy(r(w, 0)), xy(apex)], css(shade(art.roof ?? 0x2e7d32, 0.75)), OUTLINE, 0.8);
  },
  mastery_sign: (ctx, g) => sign(ctx, g, '#ffd54f', '★'),
  friendship_bench: (ctx, g) => {
    paintBox(ctx, g, null);
    const c = center(g, g.art.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('♥', c.x, c.y + 2);
  },
  garden_gnome: (ctx, g) => {
    const c = center(g);
    ball(ctx, c.x, c.y - 5, 4.5, 0x1e88e5);
    ball(ctx, c.x, c.y - 11, 3, 0xffe0b2);
    ellipse(ctx, c.x, c.y - 9, 2.6, 2.2, '#fafafa');
    polygon(ctx, [[c.x - 3.4, c.y - 12.5], [c.x + 3.4, c.y - 12.5], [c.x + 1, c.y - 21]], '#e53935', OUTLINE, 0.5);
  },
  gold_trophy: (ctx, g) => trophy(ctx, g, 0xffd700),
  golden_hoe: (ctx, g) => {
    const c = center(g);
    ellipse(ctx, c.x, c.y, 7, 3, '#8d6e63');
    pole(ctx, c.x, c.y - 1, 20, '#ffd700', 1.8);
    polygon(ctx, [[c.x, c.y - 21], [c.x + 7, c.y - 19], [c.x + 7, c.y - 16], [c.x, c.y - 18]], '#ffd700', OUTLINE, 0.5);
  },
  golden_apple_statue: (ctx, g) => {
    const c = center(g);
    polygon(ctx, [[c.x - 6, c.y], [c.x + 6, c.y], [c.x + 5, c.y - 7], [c.x - 5, c.y - 7]], '#bdbdbd', OUTLINE, 0.5);
    ball(ctx, c.x, c.y - 13, 6, 0xffd700);
    ellipse(ctx, c.x + 2, c.y - 20, 2.4, 1, '#689f38', -0.5);
  },
  lucky_horseshoe: (ctx, g) => {
    const c = center(g);
    ctx.beginPath();
    ctx.arc(c.x, c.y - 10, 6, Math.PI * 0.85, Math.PI * 2.15);
    ctx.strokeStyle = '#90a4ae';
    ctx.lineWidth = 3;
    ctx.stroke();
  },
  copper_kettle: (ctx, g) => {
    const c = center(g);
    ball(ctx, c.x, c.y - 6, 6, 0xd84315);
    line(ctx, c.x + 5, c.y - 7, c.x + 10, c.y - 11, '#bf360c', 2);
    ctx.beginPath();
    ctx.arc(c.x, c.y - 11, 4, Math.PI, 0);
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1;
    ctx.stroke();
  },
  orchard: (ctx, g) => {
    // A grassy plot inside a low fence, with a few young trees.
    const { w, h } = g;
    groundPatch(ctx, g, 0.96, '#9ccc65', 1);
    const edge = (a: number, b: number) => g.ptFull(a, b, 0);
    const corners = [edge(0.1, 0.1), edge(w - 0.1, 0.1), edge(w - 0.1, h - 0.1), edge(0.1, h - 0.1)];
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      for (const lift of [3, 6]) line(ctx, a.x, a.y - lift, b.x, b.y - lift, '#a1704a', 1.2);
    }
    for (const [a, b] of [[0.9, 0.9], [2.1, 0.9], [1.5, 1.5], [0.9, 2.1], [2.1, 2.1]] as const) {
      const p = g.ptFull(a, b, 0);
      line(ctx, p.x, p.y, p.x, p.y - 7, '#6d4c41', 1.6);
      ball(ctx, p.x, p.y - 11, 5.5, 0x43a047);
    }
  },
};

function pond(ctx: C, g: BoxGeometry, style: 'lily' | 'reeds'): void {
  const c = center(g);
  const rx = ((g.w + g.h) * TILE_WIDTH) / 4 * 0.78;
  const ry = ((g.w + g.h) * TILE_HEIGHT) / 4 * 0.78;
  ellipse(ctx, c.x, c.y + 1, rx + 2, ry + 1.5, '#8d6e63');
  const water = ctx.createRadialGradient(c.x - rx * 0.3, c.y - ry * 0.3, 1, c.x, c.y, rx);
  water.addColorStop(0, '#b3e5fc');
  water.addColorStop(1, '#0288d1');
  ellipse(ctx, c.x, c.y, rx, ry, water);
  const r = rng(style);
  if (style === 'lily') {
    for (let i = 0; i < 5; i++) {
      const x = c.x + (r() - 0.5) * rx * 1.2;
      const y = c.y + (r() - 0.5) * ry;
      ellipse(ctx, x, y, 4, 2, '#66bb6a');
      if (i % 2 === 0) circle(ctx, x + 1, y - 1, 1.3, '#f8bbd0');
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const x = c.x + Math.cos(a) * rx * 0.9;
      const y = c.y + Math.sin(a) * ry * 0.9;
      line(ctx, x, y, x + (r() - 0.5) * 2, y - 7 - r() * 4, '#558b2f', 1);
    }
  }
}

function sign(ctx: C, g: BoxGeometry, color: string, text: string): void {
  const c = center(g);
  pole(ctx, c.x, c.y, 10, '#6d4c41', 1.8);
  ctx.beginPath();
  ctx.roundRect(c.x - 8, c.y - 19, 16, 10, 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = '#5d4037';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, c.x, c.y - 11);
}

function trophy(ctx: C, g: BoxGeometry, color: number): void {
  const c = center(g);
  polygon(ctx, [[c.x - 5, c.y], [c.x + 5, c.y], [c.x + 4, c.y - 4], [c.x - 4, c.y - 4]], '#6d4c41');
  line(ctx, c.x, c.y - 4, c.x, c.y - 9, css(color), 2);
  ctx.beginPath();
  ctx.moveTo(c.x - 7, c.y - 20);
  ctx.lineTo(c.x + 7, c.y - 20);
  ctx.quadraticCurveTo(c.x + 6, c.y - 9, c.x, c.y - 9);
  ctx.quadraticCurveTo(c.x - 6, c.y - 9, c.x - 7, c.y - 20);
  const gr = ctx.createLinearGradient(c.x - 7, 0, c.x + 7, 0);
  gr.addColorStop(0, css(tint(color, 0.4)));
  gr.addColorStop(1, css(shade(color, 0.75)));
  ctx.fillStyle = gr;
  ctx.fill();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(c.x + s * 7, c.y - 16, 3, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : Math.PI * 1.5);
    ctx.strokeStyle = css(color);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- markers, badges, farmer, effects

/** Speech bubble 24 x 26 with something inside. */
export function paintBubble(ctx: C, inner: (ctx: C) => void): void {
  ctx.beginPath();
  ctx.roundRect(1, 1, 22, 18, 6);
  ctx.moveTo(8, 18.5);
  ctx.lineTo(12, 24.5);
  ctx.lineTo(16, 18.5);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  inner(ctx);
}

export function paintCoin(ctx: C, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff59d');
  g.addColorStop(0.6, '#ffc107');
  g.addColorStop(1, '#ff8f00');
  circle(ctx, x, y, r, g);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 111, 0, 0.6)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

export function paintCheck(ctx: C): void {
  ctx.beginPath();
  ctx.moveTo(6, 10);
  ctx.lineTo(10.5, 14);
  ctx.lineTo(18, 5.5);
  ctx.strokeStyle = '#43a047';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function paintHammer(ctx: C): void {
  line(ctx, 8, 15, 15, 7, '#a1704a', 3);
  ctx.fillStyle = '#78909c';
  ctx.fillRect(12, 3.5, 8, 4.5);
}

/** Gold four-point sparkles with a dark rim, readable on soil and leaves alike. */
export function paintSparkle(ctx: C): void {
  const star = (cx: number, cy: number, r: number) => {
    const w = r * 0.32;
    polygon(
      ctx,
      [[cx, cy - r], [cx + w, cy - w], [cx + r, cy], [cx + w, cy + w], [cx, cy + r], [cx - w, cy + w], [cx - r, cy], [cx - w, cy - w]],
      '#ffd54f',
      'rgba(93, 64, 55, 0.9)',
      0.8,
    );
  };
  star(8, 9, 7);
  star(15, 4, 3.5);
  circle(ctx, 8, 9, 1.2, '#ffffff');
}

/** Small round tool icons (20 x 20) for queued jobs. */
export function paintJobIcon(ctx: C, icon: 'plow' | 'plant' | 'harvest'): void {
  circle(ctx, 10, 10, 9, 'rgba(255, 248, 231, 0.95)');
  ctx.beginPath();
  ctx.arc(10, 10, 9, 0, Math.PI * 2);
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (icon === 'plow') {
    line(ctx, 6, 14, 13, 7, '#8d6e63', 2);
    polygon(ctx, [[12, 4.5], [16, 8], [13, 9.5]], '#78909c');
  } else if (icon === 'plant') {
    line(ctx, 10, 15, 10, 9, '#388e3c', 1.6);
    ellipse(ctx, 7.5, 9, 3, 1.6, '#66bb6a', -0.5);
    ellipse(ctx, 12.5, 8, 3, 1.6, '#66bb6a', 0.5);
  } else {
    polygon(ctx, [[4.5, 9], [15.5, 9], [14, 15], [6, 15]], '#c8a165', '#8d6e63', 0.8);
    ball(ctx, 8, 8, 2, 0xe53935);
    ball(ctx, 12, 7.5, 2, 0xffc107);
  }
}

/**
 * The farmer (64 x 96, standing on the tile centre at (32, 78)): straw hat,
 * blue overalls, a red shirt. `step` 0/1 alternates the legs for walking;
 * `tool` raises an arm while working.
 */
export function paintFarmer(ctx: C, step: 0 | 1, working: boolean): void {
  const cx = 32;
  const base = 78;
  ellipse(ctx, cx, base + 1, 8, 3, 'rgba(0,0,0,0.25)');
  const legA = step === 0 ? -2 : 2;
  // Legs and boots.
  polygon(ctx, [[cx - 4, base - 12], [cx - 0.5, base - 12], [cx - 1 + legA * 0.4, base - 2], [cx - 4.5 + legA * 0.4, base - 2]], '#1565c0');
  polygon(ctx, [[cx + 0.5, base - 12], [cx + 4, base - 12], [cx + 4.5 - legA * 0.4, base - 2], [cx + 1 - legA * 0.4, base - 2]], '#0d47a1');
  ellipse(ctx, cx - 3 + legA * 0.4, base - 1, 3, 1.6, '#4e342e');
  ellipse(ctx, cx + 3 - legA * 0.4, base - 1, 3, 1.6, '#3e2723');
  // Shirt, overall bib and straps.
  ctx.beginPath();
  ctx.roundRect(cx - 6, base - 25, 12, 14, 4);
  ctx.fillStyle = '#e53935';
  ctx.fill();
  polygon(ctx, [[cx - 4.5, base - 21], [cx + 4.5, base - 21], [cx + 5, base - 11], [cx - 5, base - 11]], '#1976d2');
  line(ctx, cx - 3.5, base - 21, cx - 4.5, base - 25, '#1976d2', 1.4);
  line(ctx, cx + 3.5, base - 21, cx + 4.5, base - 25, '#1976d2', 1.4);
  // Arms: one raised while working.
  line(ctx, cx - 6, base - 23, cx - 8.5, base - 15, '#e53935', 3);
  circle(ctx, cx - 8.6, base - 14.5, 1.6, '#ffcc80');
  if (working) {
    line(ctx, cx + 6, base - 23, cx + 10, base - 30, '#e53935', 3);
    circle(ctx, cx + 10.3, base - 30.5, 1.6, '#ffcc80');
  } else {
    line(ctx, cx + 6, base - 23, cx + 8.5, base - 15, '#e53935', 3);
    circle(ctx, cx + 8.6, base - 14.5, 1.6, '#ffcc80');
  }
  // Head and straw hat.
  ball(ctx, cx, base - 30, 5, 0xffcc80);
  eye(ctx, cx + 2, base - 30.5, 0.8);
  ellipse(ctx, cx, base - 34, 9, 2.6, '#f9d56e');
  ctx.beginPath();
  ctx.ellipse(cx, base - 35.5, 5, 4, 0, Math.PI, 0);
  ctx.fillStyle = '#fbe08a';
  ctx.fill();
  line(ctx, cx - 4.8, base - 35, cx + 4.8, base - 35, '#c62828', 1.2);
}

/** A soft white dot for particles (tinted per effect). */
export function paintDot(ctx: C): void {
  const g = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  circle(ctx, 4, 4, 4, g);
}
