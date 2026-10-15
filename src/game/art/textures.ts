/**
 * Generates placeholder textures at runtime (PLAN.md section 10, "art plan").
 * Everything is drawn at TEX_SCALE x size and displayed at 1/TEX_SCALE so it stays crisp when zoomed in.
 */
import Phaser from 'phaser';
import type { Content } from '../../content';
import { GROWTH_STAGES } from '../../core';
import { TILE_HEIGHT, TILE_WIDTH } from '../iso';
import { animalArt, cropArt, decorationArt, treeArt } from './artData';
import type { CropArt } from './artData';

export const TEX_SCALE = 2;

/** Crop textures are taller than a tile; the tile diamond's centre sits at this y. */
export const CROP_TEX_W = TILE_WIDTH;
export const CROP_TEX_H = 64;
export const CROP_TEX_CENTER_Y = CROP_TEX_H - TILE_HEIGHT / 2 - 4;

export type CropVisual = number | 'ripe' | 'withered';

export function soilKey(plowed: boolean): string {
  return plowed ? 'soil-plowed' : 'soil-fallow';
}

export function cropKey(cropId: string, visual: CropVisual): string {
  return `crop-${cropId}-${visual}`;
}

export function decorationKey(itemId: string, rotated: boolean): string {
  return `deco-${itemId}-${rotated ? 'r' : 'n'}`;
}

export function treeKey(itemId: string, ready: boolean): string {
  return `tree-${itemId}-${ready ? 'ready' : 'growing'}`;
}

export function animalKey(itemId: string): string {
  return `animal-${itemId}`;
}

export const READY_MARKER_KEY = 'ready-marker';

/** Trees and animals: 1x1 sprites taller than a tile; the tile centre sits at this y. */
export const TALL_TEX_W = TILE_WIDTH;
export const TALL_TEX_H = 96;
export const TALL_TEX_CENTER_Y = TALL_TEX_H - TILE_HEIGHT / 2 - 2;

/** Extra headroom above a box for its roof. */
function roofHeadroom(itemId: string): number {
  return decorationArt(itemId).roofHeight ?? 0;
}

/** Texture origin for box images (decorations, buildings), so the footprint centre lands on the anchor point. */
export function decorationOrigin(w: number, h: number, height: number, itemId?: string): { x: number; y: number } {
  const top = height + (itemId ? roofHeadroom(itemId) : 0);
  const texW = ((w + h) * TILE_WIDTH) / 2;
  const texH = ((w + h) * TILE_HEIGHT) / 2 + top;
  const cx = ((w - h) * TILE_WIDTH) / 4 + (h * TILE_WIDTH) / 2;
  const cy = ((w + h) * TILE_HEIGHT) / 4 + top;
  return { x: cx / texW, y: cy / texH };
}

export function generateTextures(scene: Phaser.Scene, content: Content): void {
  const g = scene.make.graphics({}, false);
  makeSoil(scene, g, true);
  makeSoil(scene, g, false);
  for (const cropId of Object.keys(content.crops)) {
    const art = cropArt(cropId);
    for (let stage = 0; stage < GROWTH_STAGES; stage++) makeCrop(scene, g, cropKey(cropId, stage), art, stage);
    makeCrop(scene, g, cropKey(cropId, 'ripe'), art, 'ripe');
    makeCrop(scene, g, cropKey(cropId, 'withered'), art, 'withered');
  }
  for (const item of Object.values(content.placeables)) {
    if (item.kind === 'decoration' || item.kind === 'building') {
      makeDecoration(scene, g, item.id, item.width, item.height, false);
      if (item.width !== item.height) makeDecoration(scene, g, item.id, item.width, item.height, true);
    } else if (item.kind === 'tree') {
      makeTree(scene, g, item.id, false);
      makeTree(scene, g, item.id, true);
    } else {
      makeAnimal(scene, g, item.id);
    }
  }
  makeReadyMarker(scene, g);
  g.destroy();
}

/** Makes sure a texture exists for an item added after boot (e.g. content loaded later). */
export function ensureDecorationTexture(scene: Phaser.Scene, itemId: string, w: number, h: number, rotated: boolean): string {
  const key = decorationKey(itemId, rotated);
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    makeDecoration(scene, g, itemId, w, h, rotated);
    g.destroy();
  }
  return key;
}

function save(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, key: string, w: number, h: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  g.generateTexture(key, Math.ceil(w * TEX_SCALE), Math.ceil(h * TEX_SCALE));
  g.clear();
}

function diamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number): void {
  const s = TEX_SCALE;
  g.beginPath();
  g.moveTo(cx * s, (cy - h / 2) * s);
  g.lineTo((cx + w / 2) * s, cy * s);
  g.lineTo(cx * s, (cy + h / 2) * s);
  g.lineTo((cx - w / 2) * s, cy * s);
  g.closePath();
}

function makeSoil(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, plowed: boolean): void {
  const s = TEX_SCALE;
  const cx = TILE_WIDTH / 2;
  const cy = TILE_HEIGHT / 2;
  const inset = 0.92;
  g.fillStyle(plowed ? 0x6d4c41 : 0xa1887f, 1);
  diamond(g, cx, cy, TILE_WIDTH * inset, TILE_HEIGHT * inset);
  g.fillPath();
  g.lineStyle(1.5 * s, plowed ? 0x4e342e : 0x8d6e63, 1);
  diamond(g, cx, cy, TILE_WIDTH * inset, TILE_HEIGHT * inset);
  g.strokePath();

  if (plowed) {
    // Furrows running along one iso axis.
    g.lineStyle(1.2 * s, 0x4e342e, 0.9);
    for (let i = -2; i <= 2; i++) {
      const fx = cx - i * 6;
      const fy = cy + i * 3;
      g.lineBetween((fx - 12) * s, (fy - 6) * s, (fx + 12) * s, (fy + 6) * s);
    }
  } else {
    g.fillStyle(0x8d6e63, 1);
    for (const [dx, dy] of [[-10, -2], [6, -4], [12, 2], [-4, 4], [2, 0]] as const) {
      g.fillCircle((cx + dx) * s, (cy + dy) * s, 1.2 * s);
    }
  }
  save(scene, g, soilKey(plowed), TILE_WIDTH, TILE_HEIGHT);
}

const PLANT_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [-5, -6], [5, -6], [-14, 0], [14, 0], [0, 0], [-5, 6], [5, 6],
];
const VINE_SPOTS: ReadonlyArray<readonly [number, number]> = [[-9, -1], [8, -3], [0, 5]];

function makeCrop(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, key: string, art: CropArt, visual: CropVisual): void {
  const cx = CROP_TEX_W / 2;
  const cy = CROP_TEX_CENTER_Y;
  const growth = visual === 'ripe' ? 1 : visual === 'withered' ? 0.75 : 0.3 + (visual / GROWTH_STAGES) * 0.6;
  const withered = visual === 'withered';
  const ripe = visual === 'ripe';
  const spots = art.style === 'vine' ? VINE_SPOTS : PLANT_SPOTS;

  for (const [dx, dy] of spots) {
    const x = cx + dx;
    const y = cy + dy;
    if (art.style === 'stalk') drawStalk(g, x, y, growth, ripe, withered, art.fruit);
    else if (art.style === 'vine') drawVine(g, x, y, growth, ripe, withered, art.fruit);
    else drawBush(g, x, y, growth, ripe, withered, art.fruit);
  }
  save(scene, g, key, CROP_TEX_W, CROP_TEX_H);
}

const LEAF = 0x43a047;
const LEAF_DARK = 0x2e7d32;
const DEAD = 0x8d6e63;
const DEAD_DARK = 0x6d4c41;

function drawBush(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, ripe: boolean, dead: boolean, fruit: number): void {
  const s = TEX_SCALE;
  const r = 5 * f;
  g.fillStyle(dead ? DEAD_DARK : LEAF_DARK, 1);
  g.fillEllipse(x * s, (y - r * 0.6) * s, r * 2.2 * s, r * 1.6 * s);
  g.fillStyle(dead ? DEAD : LEAF, 1);
  g.fillEllipse((x - r * 0.3) * s, (y - r * 0.9) * s, r * 1.5 * s, r * 1.2 * s);
  if (ripe) {
    g.fillStyle(fruit, 1);
    g.fillCircle((x - 2) * s, (y - r * 0.5) * s, 1.8 * s);
    g.fillCircle((x + 2.5) * s, (y - r * 0.9) * s, 1.8 * s);
    g.fillCircle((x + 0.5) * s, (y - r * 0.1) * s, 1.6 * s);
  }
}

function drawStalk(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, ripe: boolean, dead: boolean, fruit: number): void {
  const s = TEX_SCALE;
  const h = 16 * f;
  const color = dead ? DEAD : ripe ? fruit : LEAF;
  g.lineStyle(1.6 * s, color, 1);
  for (const ox of [-2, 0, 2]) {
    const lean = dead ? ox * 2.5 : ox * 0.6;
    g.lineBetween((x + ox * 0.5) * s, y * s, (x + lean) * s, (y - h) * s);
  }
  if (ripe || dead) {
    g.fillStyle(dead ? DEAD_DARK : fruit, 1);
    g.fillEllipse(x * s, (y - h) * s, 3 * s, 5 * s);
  }
}

function drawVine(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, ripe: boolean, dead: boolean, fruit: number): void {
  const s = TEX_SCALE;
  g.fillStyle(dead ? DEAD_DARK : LEAF_DARK, 1);
  g.fillEllipse((x - 4) * s, y * s, 9 * f * s, 5 * f * s);
  g.fillEllipse((x + 4) * s, (y - 1) * s, 9 * f * s, 5 * f * s);
  if (ripe || dead) {
    g.fillStyle(dead ? DEAD : fruit, 1);
    g.fillEllipse(x * s, (y - 3) * s, 11 * s, 8 * s);
    g.lineStyle(1 * s, dead ? DEAD_DARK : 0xc66a00, 1);
    g.strokeEllipse(x * s, (y - 3) * s, 5 * s, 8 * s);
  } else {
    g.fillStyle(0xfff59d, 1); // flowers
    g.fillCircle((x + 1) * s, (y - 2) * s, 1.5 * f * s);
  }
}

function makeDecoration(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  itemId: string,
  baseW: number,
  baseH: number,
  rotated: boolean,
): void {
  const s = TEX_SCALE;
  const art = decorationArt(itemId);
  const w = rotated ? baseH : baseW;
  const h = rotated ? baseW : baseH;
  const roofH = art.roofHeight ?? 0;
  // Everything is drawn `roofH` lower so the roof fits inside the texture.
  const height = art.height + roofH;
  const texW = ((w + h) * TILE_WIDTH) / 2;
  const texH = ((w + h) * TILE_HEIGHT) / 2 + height;

  // Grid point (a, b) -> texture coords (unscaled), ground level.
  const centerA = w / 2;
  const centerB = h / 2;
  const pt = (a: number, b: number, lift: number) => {
    const ia = centerA + (a - centerA) * art.inset;
    const ib = centerB + (b - centerB) * art.inset;
    return {
      x: ((ia - ib) * TILE_WIDTH) / 2 + (h * TILE_WIDTH) / 2,
      y: ((ia + ib) * TILE_HEIGHT) / 2 + height - lift,
    };
  };
  const poly = (points: { x: number; y: number }[], color: number) => {
    g.fillStyle(color, 1);
    g.beginPath();
    points.forEach((p, i) => (i === 0 ? g.moveTo(p.x * s, p.y * s) : g.lineTo(p.x * s, p.y * s)));
    g.closePath();
    g.fillPath();
  };

  const wall = art.height;
  const left = pt(0, h, 0);
  const bottom = pt(w, h, 0);
  const right = pt(w, 0, 0);
  // Left face, right face, then the top.
  poly([left, bottom, pt(w, h, wall), pt(0, h, wall)], art.left);
  poly([bottom, right, pt(w, 0, wall), pt(w, h, wall)], art.right);
  poly([pt(0, 0, wall), pt(w, 0, wall), pt(w, h, wall), pt(0, h, wall)], art.top);

  if (art.roof !== undefined && roofH > 0) {
    // Pyramid roof: the two faces toward the viewer, a little wider than the walls.
    const overhang = 1.08;
    const r = (a: number, b: number) => pt(centerA + (a - centerA) * overhang, centerB + (b - centerB) * overhang, wall);
    const apex = pt(centerA, centerB, wall + roofH);
    poly([r(0, h), r(w, h), apex], shadeColor(art.roof, 0.9));
    poly([r(w, h), r(w, 0), apex], shadeColor(art.roof, 0.72));
  }

  save(scene, g, decorationKey(itemId, rotated), texW, texH);
}

function makeTree(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, itemId: string, ready: boolean): void {
  const s = TEX_SCALE;
  const art = treeArt(itemId);
  const cx = TALL_TEX_W / 2;
  const base = TALL_TEX_CENTER_Y;
  // Shadow, trunk, canopy.
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(cx * s, (base + 2) * s, 34 * s, 12 * s);
  g.fillStyle(0x6d4c41, 1);
  g.fillRect((cx - 3) * s, (base - 30) * s, 6 * s, 30 * s);
  g.fillStyle(shadeColor(art.canopy, 0.8), 1);
  g.fillCircle((cx - 9) * s, (base - 38) * s, 13 * s);
  g.fillCircle((cx + 9) * s, (base - 38) * s, 13 * s);
  g.fillStyle(art.canopy, 1);
  g.fillCircle(cx * s, (base - 48) * s, 16 * s);
  g.fillCircle((cx - 7) * s, (base - 42) * s, 11 * s);
  if (ready) {
    g.fillStyle(art.fruit, 1);
    for (const [dx, dy] of [[-10, -40], [8, -44], [-2, -54], [12, -34], [-6, -32], [4, -60]] as const) {
      g.fillCircle((cx + dx) * s, (base + dy) * s, 3 * s);
    }
  }
  save(scene, g, treeKey(itemId, ready), TALL_TEX_W, TALL_TEX_H);
}

function makeAnimal(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, itemId: string): void {
  const s = TEX_SCALE;
  const art = animalArt(itemId);
  const k = art.size;
  const cx = TALL_TEX_W / 2;
  const base = TALL_TEX_CENTER_Y;
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(cx * s, (base + 1) * s, 26 * k * s, 9 * k * s);
  // Legs
  g.fillStyle(shadeColor(art.body, 0.6), 1);
  for (const dx of [-7, -3, 3, 7]) g.fillRect((cx + dx * k - 1.2) * s, (base - 7 * k) * s, 2.4 * s, 7 * k * s);
  // Body, spots, head
  g.fillStyle(art.body, 1);
  g.fillEllipse(cx * s, (base - 11 * k) * s, 24 * k * s, 13 * k * s);
  if (art.spots !== undefined) {
    g.fillStyle(art.spots, 1);
    g.fillCircle((cx - 4 * k) * s, (base - 12 * k) * s, 3 * k * s);
    g.fillCircle((cx + 5 * k) * s, (base - 9 * k) * s, 2.5 * k * s);
  }
  g.fillStyle(art.body, 1);
  g.fillCircle((cx + 12 * k) * s, (base - 17 * k) * s, 6 * k * s);
  g.fillStyle(art.accent, 1);
  g.fillCircle((cx + 16 * k) * s, (base - 16 * k) * s, 2.4 * k * s);
  g.fillStyle(0x212121, 1);
  g.fillCircle((cx + 13 * k) * s, (base - 19 * k) * s, 1.1 * s);
  save(scene, g, animalKey(itemId), TALL_TEX_W, TALL_TEX_H);
}

/** Speech-bubble marker with a coin, floated over anything ready to collect. */
function makeReadyMarker(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics): void {
  const s = TEX_SCALE;
  g.fillStyle(0xffffff, 1);
  g.lineStyle(1.5 * s, 0x5d4037, 1);
  g.fillRoundedRect(1 * s, 1 * s, 22 * s, 18 * s, 6 * s);
  g.strokeRoundedRect(1 * s, 1 * s, 22 * s, 18 * s, 6 * s);
  g.fillTriangle(8 * s, 18 * s, 16 * s, 18 * s, 12 * s, 24 * s);
  g.fillStyle(0xffc107, 1);
  g.fillCircle(12 * s, 10 * s, 6 * s);
  g.fillStyle(0xffe082, 1);
  g.fillCircle(11 * s, 9 * s, 3 * s);
  save(scene, g, READY_MARKER_KEY, 24, 26);
}

function shadeColor(c: number, f: number): number {
  const r = Math.round(((c >> 16) & 255) * f);
  const gr = Math.round(((c >> 8) & 255) * f);
  const b = Math.round((c & 255) * f);
  return (r << 16) | (gr << 8) | b;
}
