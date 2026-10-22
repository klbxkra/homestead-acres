/** Sprites for farm entities, kept in sync with game state. */
import Phaser from 'phaser';
import type { Content } from '../../content';
import { cropStage, cropStatus, footprintOf, isProducing, lookup } from '../../core';
import type { Entity, ItemEntity, PlotEntity, WorldRules } from '../../core';
import { decorationArt } from '../art/artData';
import {
  animalKey,
  BUILD_MARKER_KEY,
  CROP_TEX_CENTER_Y,
  CROP_TEX_H,
  cropKey,
  decorationOrigin,
  ensureDecorationTexture,
  FERTILIZED_BADGE_KEY,
  HELPED_MARKER_KEY,
  READY_MARKER_KEY,
  setArt,
  soilKey,
  TALL_TEX_CENTER_Y,
  TALL_TEX_H,
  TEX_SCALE,
  treeKey,
} from '../art/textures';
import type { CropVisual } from '../art/textures';
import { depthOf, tileToWorld } from '../iso';

/** Depth bands: ground < soil < hover outline < objects (sorted by iso depth) < ghost < effects. */
export const DEPTH = { ground: -30, soil: -20, highlight: -10, ghost: 10_000, fx: 20_000 } as const;

/** What every view shares: where it is (for culling) and whether it's on screen. */
interface ViewBase {
  /** World position of the entity's anchor (footprint centre). */
  wx: number;
  wy: number;
  /** Off screen: everything hidden regardless of state. */
  culled: boolean;
}

export interface PlotView extends ViewBase {
  kind: 'plot';
  soil: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
  /** Fertilized sparkle, or a "helped" tick while visiting. */
  badge: Phaser.GameObjects.Image;
  /** Wanted visibility from game state (before culling). */
  showCrop: boolean;
  showBadge: boolean;
}

/** Per-view state that isn't in the entity itself. */
export interface ViewOptions {
  /** Visiting: you already helped with this today. */
  helped: boolean;
}

/** Decorations, buildings, trees and animals: one sprite plus a "ready to collect" bubble. */
export interface ItemView extends ViewBase {
  kind: 'item';
  entityKind: ItemEntity['kind'];
  image: Phaser.GameObjects.Image;
  marker: Phaser.GameObjects.Image;
  showMarker: boolean;
  /** Resting y of the marker (it bobs around this). */
  markerY: number;
}

export type EntityView = PlotView | ItemView;

export function createView(scene: Phaser.Scene, entity: Entity): EntityView {
  const base = { wx: 0, wy: 0, culled: false };
  if (entity.kind === 'plot') {
    const soil = setArt(scene.add.image(0, 0, '__DEFAULT'), soilKey(true)).setScale(1 / TEX_SCALE).setDepth(DEPTH.soil);
    const crop = scene.add
      .image(0, 0, '__DEFAULT')
      .setScale(1 / TEX_SCALE)
      .setOrigin(0.5, CROP_TEX_CENTER_Y / CROP_TEX_H)
      .setVisible(false);
    const badge = setArt(scene.add.image(0, 0, '__DEFAULT'), FERTILIZED_BADGE_KEY).setScale(1 / TEX_SCALE).setVisible(false);
    return { ...base, kind: 'plot', soil, crop, badge, showCrop: false, showBadge: false };
  }
  const image = scene.add.image(0, 0, '__DEFAULT').setScale(1 / TEX_SCALE);
  const marker = setArt(scene.add.image(0, 0, '__DEFAULT'), READY_MARKER_KEY).setScale(1 / TEX_SCALE).setOrigin(0.5, 1).setVisible(false);
  return { ...base, kind: 'item', entityKind: entity.kind, image, marker, showMarker: false, markerY: 0 };
}

/** True when a view can't show this entity (it changed kind) and must be rebuilt. */
export function viewMismatch(view: EntityView, entity: Entity): boolean {
  if (entity.kind === 'plot') return view.kind !== 'plot';
  return view.kind !== 'item' || view.entityKind !== entity.kind;
}

export function updateView(
  scene: Phaser.Scene,
  view: EntityView,
  entity: Entity,
  gameNow: number,
  rules: WorldRules,
  content: Content,
  options: ViewOptions = { helped: false },
): void {
  if (view.kind === 'plot' && entity.kind === 'plot') updatePlot(view, entity, gameNow, rules, content, options);
  else if (view.kind === 'item' && entity.kind !== 'plot') updateItem(scene, view, entity, gameNow, content, options);
  applyVisibility(view);
}

/** Hides a view that's off screen (or shows it again). Cheap when nothing changes. */
export function setViewCulled(view: EntityView, culled: boolean): void {
  if (view.culled === culled) return;
  view.culled = culled;
  applyVisibility(view);
}

function applyVisibility(view: EntityView): void {
  const on = !view.culled;
  if (view.kind === 'plot') {
    setVisible(view.soil, on);
    setVisible(view.crop, on && view.showCrop);
    setVisible(view.badge, on && view.showBadge);
  } else {
    setVisible(view.image, on);
    setVisible(view.marker, on && view.showMarker);
  }
}

function setVisible(img: Phaser.GameObjects.Image, visible: boolean): void {
  if (img.visible !== visible) img.setVisible(visible);
}

export function destroyView(view: EntityView): void {
  if (view.kind === 'plot') {
    view.soil.destroy();
    view.crop.destroy();
    view.badge.destroy();
  } else {
    view.image.destroy();
    view.marker.destroy();
  }
}

export function setViewAlpha(view: EntityView, alpha: number): void {
  const parts = view.kind === 'plot' ? [view.soil, view.crop, view.badge] : [view.image, view.marker];
  for (const p of parts) if (p.alpha !== alpha) p.setAlpha(alpha);
}

/** Position/depth setters that skip no-op updates (setDepth re-sorts the display list). */
function place(img: Phaser.GameObjects.Image, x: number, y: number, depth?: number): void {
  if (img.x !== x || img.y !== y) img.setPosition(x, y);
  if (depth !== undefined && img.depth !== depth) img.setDepth(depth);
}

function cropVisual(plot: PlotEntity, gameNow: number, rules: WorldRules): CropVisual | null {
  if (!plot.crop) return null;
  const status = cropStatus(plot.crop, gameNow, rules);
  if (status === 'ripe') return 'ripe';
  if (status === 'withered') return 'withered';
  return cropStage(plot.crop, gameNow);
}

function updatePlot(view: PlotView, plot: PlotEntity, gameNow: number, rules: WorldRules, content: Content, options: ViewOptions): void {
  const { x, y } = tileToWorld(plot.x, plot.y);
  view.wx = x;
  view.wy = y;
  place(view.soil, x, y);
  setArt(view.soil, soilKey(plot.plowed || plot.crop !== null));

  const visual = cropVisual(plot, gameNow, rules);
  const depth = depthOf(plot.x, plot.y);
  view.showBadge = true;
  if (options.helped) {
    setArt(view.badge, HELPED_MARKER_KEY).setOrigin(0.5, 1);
    place(view.badge, x, y - 18, depth + 0.5);
  } else if (plot.crop?.fertilized && visual !== 'withered') {
    setArt(view.badge, FERTILIZED_BADGE_KEY).setOrigin(0.5, 0.5);
    place(view.badge, x + 12, y - 12, depth + 0.5);
  } else {
    view.showBadge = false;
  }
  view.showCrop = visual !== null && !!plot.crop && !!lookup(content.crops, plot.crop.cropId);
  if (!view.showCrop || !plot.crop || visual === null) return;
  setArt(view.crop, cropKey(plot.crop.cropId, visual));
  place(view.crop, x, y, depth);
}

function updateItem(scene: Phaser.Scene, view: ItemView, entity: ItemEntity, gameNow: number, content: Content, options: ViewOptions): void {
  const fp = footprintOf(entity, content);
  const depth = depthOf(fp.x + fp.w - 1, fp.y + fp.h - 1);
  const anchor = tileToWorld(fp.x + (fp.w - 1) / 2, fp.y + (fp.h - 1) / 2);
  view.wx = anchor.x;
  view.wy = anchor.y;
  let topY: number;

  if (entity.kind === 'tree' || entity.kind === 'animal') {
    const ready = gameNow >= entity.readyAt;
    setArt(view.image, entity.kind === 'tree' ? treeKey(entity.itemId, ready) : animalKey(entity.itemId));
    view.image.setOrigin(0.5, TALL_TEX_CENTER_Y / TALL_TEX_H);
    topY = anchor.y - (entity.kind === 'tree' ? 66 : 30);
  } else {
    const item = lookup(content.placeables, entity.itemId);
    const key = ensureDecorationTexture(scene, entity.itemId, item?.width ?? 1, item?.height ?? 1, entity.rotated);
    setArt(view.image, key);
    const art = decorationArt(entity.itemId);
    const origin = decorationOrigin(fp.w, fp.h, art.height, entity.itemId);
    view.image.setOrigin(origin.x, origin.y);
    topY = anchor.y - art.height - (art.roofHeight ?? 0) - 4;
  }
  place(view.image, anchor.x, anchor.y, depth);
  const frame = entity.kind === 'building' && entity.parts !== undefined;
  if (frame) view.image.setTint(0xd7c4a0);
  else if (view.image.isTinted) view.image.clearTint();

  // One bubble at most: helped (visiting) > needs parts > ready to collect.
  const marker = options.helped
    ? HELPED_MARKER_KEY
    : frame
      ? BUILD_MARKER_KEY
      : entity.kind !== 'decoration' && isProducing(entity, gameNow)
        ? READY_MARKER_KEY
        : null;
  view.showMarker = marker !== null;
  if (marker) {
    setArt(view.marker, marker);
    view.markerY = topY;
    if (view.marker.x !== anchor.x) view.marker.setX(anchor.x);
    if (view.marker.depth !== depth + 0.5) view.marker.setDepth(depth + 0.5);
    if (!view.marker.visible) view.marker.setY(topY); // the scene bobs it from here
  }
}
