/**
 * Generated art (PLAN.md section 10, "art plan"): every sprite is painted at
 * boot with the Canvas 2D painters in paint.ts and packed into a few atlas pages
 * (atlas.ts). Sprites are drawn at TEX_SCALE x size and shown at 1/TEX_SCALE so
 * they stay crisp when zoomed in. Views look sprites up by key with setArt().
 */
import type Phaser from 'phaser';
import type { Content } from '../../content';
import { GROWTH_STAGES } from '../../core';
import { TILE_HEIGHT, TILE_WIDTH } from '../iso';
import { animalArt, cropArt, decorationArt, treeArt } from './artData';
import { AtlasBuilder } from './atlas';
import type { FrameRef } from './atlas';
import {
  boxGeometry,
  paintAnimal,
  paintBubble,
  paintCheck,
  paintCoin,
  paintCrop,
  paintDot,
  paintFarmer,
  paintGrass,
  paintHammer,
  paintItem,
  paintJobIcon,
  paintSoil,
  paintSparkle,
  paintTree,
} from './paint';
import type { CropVisual } from './paint';

export type { CropVisual } from './paint';

export const TEX_SCALE = 2;

/** Crop textures are taller than a tile; the tile diamond's centre sits at this y. */
export const CROP_TEX_W = TILE_WIDTH;
export const CROP_TEX_H = 64;
export const CROP_TEX_CENTER_Y = CROP_TEX_H - TILE_HEIGHT / 2 - 4;

/** Trees, animals and the farmer: 1x1 sprites taller than a tile; the tile centre sits at this y. */
export const TALL_TEX_W = TILE_WIDTH;
export const TALL_TEX_H = 96;
export const TALL_TEX_CENTER_Y = TALL_TEX_H - TILE_HEIGHT / 2 - 2;

/** Grass tiles are a pixel bigger than a tile so neighbours overlap and no seams show. */
const GRASS_W = TILE_WIDTH + 2;
const GRASS_H = TILE_HEIGHT + 1;

export const READY_MARKER_KEY = 'ready-marker';
/** Green tick bubble: already helped with today (visiting a neighbor). */
export const HELPED_MARKER_KEY = 'helped-marker';
/** Hammer bubble over a construction building that still needs parts. */
export const BUILD_MARKER_KEY = 'build-marker';
/** Small sparkle on a fertilized crop. */
export const FERTILIZED_BADGE_KEY = 'fertilized-badge';
/** Particle dot (tinted per effect). */
export const DOT_KEY = 'fx-dot';

export const GRASS_VARIANTS = 3;

/** `checker` 0/1 picks the lighter or darker green; `variant` the tuft pattern. */
export function grassKey(checker: number, variant: number): string {
  return `grass-${checker}-${variant}`;
}

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

export function farmerKey(frame: 'stand' | 'step' | 'work'): string {
  return `farmer-${frame}`;
}

export function jobIconKey(icon: 'plow' | 'plant' | 'harvest'): string {
  return `job-${icon}`;
}

/** Where each sprite key lives (atlas page + frame, or a standalone texture). */
const ART = new Map<string, FrameRef>();

/** Points an image at a sprite by key (no-op when it already shows it). */
export function setArt(img: Phaser.GameObjects.Image, key: string): Phaser.GameObjects.Image {
  const ref = ART.get(key);
  if (!ref) return img;
  if (img.texture.key !== ref.texture || img.frame.name !== ref.frame) img.setTexture(ref.texture, ref.frame);
  return img;
}

export function hasArt(key: string): boolean {
  return ART.has(key);
}

/** Texture origin for box images (decorations, buildings), so the footprint centre lands on the anchor point. */
export function decorationOrigin(w: number, h: number, height: number, itemId?: string): { x: number; y: number } {
  const top = height + (itemId ? (decorationArt(itemId).roofHeight ?? 0) : 0);
  const texW = ((w + h) * TILE_WIDTH) / 2;
  const texH = ((w + h) * TILE_HEIGHT) / 2 + top;
  const cx = ((w - h) * TILE_WIDTH) / 4 + (h * TILE_WIDTH) / 2;
  const cy = ((w + h) * TILE_HEIGHT) / 4 + top;
  return { x: cx / texW, y: cy / texH };
}

/** Paints every sprite the content needs into the atlas. Call once per scene create. */
export function generateTextures(scene: Phaser.Scene, content: Content): void {
  const atlas = new AtlasBuilder('art', TEX_SCALE);
  for (const checker of [0, 1]) {
    for (let v = 0; v < GRASS_VARIANTS; v++) atlas.draw(grassKey(checker, v), GRASS_W, GRASS_H, (c) => paintGrass(c, checker, v, GRASS_W, GRASS_H));
  }
  atlas.draw(soilKey(true), TILE_WIDTH, TILE_HEIGHT, (c) => paintSoil(c, true));
  atlas.draw(soilKey(false), TILE_WIDTH, TILE_HEIGHT, (c) => paintSoil(c, false));
  for (const cropId of Object.keys(content.crops)) {
    const art = cropArt(cropId);
    const visuals: CropVisual[] = [...Array.from({ length: GROWTH_STAGES }, (_, i) => i), 'ripe', 'withered'];
    for (const v of visuals) atlas.draw(cropKey(cropId, v), CROP_TEX_W, CROP_TEX_H, (c) => paintCrop(c, art, v, CROP_TEX_W / 2, CROP_TEX_CENTER_Y));
  }
  for (const item of Object.values(content.placeables)) {
    if (item.kind === 'decoration' || item.kind === 'building') {
      drawItem(atlas, item.id, item.width, item.height, false, item.kind === 'building');
      if (item.width !== item.height) drawItem(atlas, item.id, item.width, item.height, true, item.kind === 'building');
    } else if (item.kind === 'tree') {
      for (const ready of [false, true]) {
        atlas.draw(treeKey(item.id, ready), TALL_TEX_W, TALL_TEX_H, (c) => paintTree(c, item.id, treeArt(item.id), ready, TALL_TEX_W / 2, TALL_TEX_CENTER_Y));
      }
    } else {
      atlas.draw(animalKey(item.id), TALL_TEX_W, TALL_TEX_H, (c) => paintAnimal(c, item.id, animalArt(item.id), TALL_TEX_W / 2, TALL_TEX_CENTER_Y));
    }
  }
  atlas.draw(READY_MARKER_KEY, 24, 26, (c) => paintBubble(c, (cc) => paintCoin(cc, 12, 10, 6)));
  atlas.draw(HELPED_MARKER_KEY, 24, 26, (c) => paintBubble(c, paintCheck));
  atlas.draw(BUILD_MARKER_KEY, 24, 26, (c) => paintBubble(c, paintHammer));
  atlas.draw(FERTILIZED_BADGE_KEY, 20, 18, paintSparkle);
  atlas.draw(farmerKey('stand'), TALL_TEX_W, TALL_TEX_H, (c) => paintFarmer(c, 0, false));
  atlas.draw(farmerKey('step'), TALL_TEX_W, TALL_TEX_H, (c) => paintFarmer(c, 1, false));
  atlas.draw(farmerKey('work'), TALL_TEX_W, TALL_TEX_H, (c) => paintFarmer(c, 0, true));
  for (const icon of ['plow', 'plant', 'harvest'] as const) atlas.draw(jobIconKey(icon), 20, 20, (c) => paintJobIcon(c, icon));
  atlas.draw(DOT_KEY, 8, 8, paintDot);
  for (const [key, ref] of atlas.commit(scene.textures)) ART.set(key, ref);
}

function drawItem(atlas: AtlasBuilder, itemId: string, baseW: number, baseH: number, rotated: boolean, isBuilding: boolean): void {
  const w = rotated ? baseH : baseW;
  const h = rotated ? baseW : baseH;
  const { width, height, geo } = boxGeometry(w, h, decorationArt(itemId));
  atlas.draw(decorationKey(itemId, rotated), width, height, (c) => paintItem(c, itemId, geo, isBuilding));
}

/** Makes sure a sprite exists for an item the atlas doesn't have (e.g. content added later). */
export function ensureDecorationTexture(scene: Phaser.Scene, itemId: string, w: number, h: number, rotated: boolean): string {
  const key = decorationKey(itemId, rotated);
  if (ART.has(key)) return key;
  const one = new AtlasBuilder(`solo-${key}`, TEX_SCALE, 1024);
  drawItem(one, itemId, w, h, rotated, false);
  for (const [k, ref] of one.commit(scene.textures)) ART.set(k, ref);
  return key;
}
