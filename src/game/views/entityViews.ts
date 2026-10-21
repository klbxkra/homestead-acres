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

export interface PlotView {
  kind: 'plot';
  soil: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
  /** Fertilized sparkle, or a "helped" tick while visiting. */
  badge: Phaser.GameObjects.Image;
}

/** Per-view state that isn't in the entity itself. */
export interface ViewOptions {
  /** Visiting: you already helped with this today. */
  helped: boolean;
}

/** Decorations, buildings, trees and animals: one sprite plus a "ready to collect" bubble. */
export interface ItemView {
  kind: 'item';
  entityKind: ItemEntity['kind'];
  image: Phaser.GameObjects.Image;
  marker: Phaser.GameObjects.Image;
}

export type EntityView = PlotView | ItemView;

export function createView(scene: Phaser.Scene, entity: Entity): EntityView {
  if (entity.kind === 'plot') {
    const soil = scene.add.image(0, 0, soilKey(true)).setScale(1 / TEX_SCALE).setDepth(DEPTH.soil);
    const crop = scene.add
      .image(0, 0, '__DEFAULT')
      .setScale(1 / TEX_SCALE)
      .setOrigin(0.5, CROP_TEX_CENTER_Y / CROP_TEX_H)
      .setVisible(false);
    const badge = scene.add.image(0, 0, FERTILIZED_BADGE_KEY).setScale(1 / TEX_SCALE).setVisible(false);
    return { kind: 'plot', soil, crop, badge };
  }
  const image = scene.add.image(0, 0, '__DEFAULT').setScale(1 / TEX_SCALE);
  const marker = scene.add.image(0, 0, READY_MARKER_KEY).setScale(1 / TEX_SCALE).setOrigin(0.5, 1).setVisible(false);
  return { kind: 'item', entityKind: entity.kind, image, marker };
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
  if (view.kind === 'plot') {
    view.soil.setAlpha(alpha);
    view.crop.setAlpha(alpha);
    view.badge.setAlpha(alpha);
  } else {
    view.image.setAlpha(alpha);
    view.marker.setAlpha(alpha);
  }
}

function setTextureIfChanged(img: Phaser.GameObjects.Image, key: string): void {
  if (img.texture.key !== key) img.setTexture(key);
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
  view.soil.setPosition(x, y);
  setTextureIfChanged(view.soil, soilKey(plot.plowed || plot.crop !== null));

  const visual = cropVisual(plot, gameNow, rules);
  const depth = depthOf(plot.x, plot.y);
  if (options.helped) {
    setTextureIfChanged(view.badge, HELPED_MARKER_KEY);
    view.badge.setOrigin(0.5, 1).setPosition(x, y - 18).setDepth(depth + 0.5).setVisible(true);
  } else if (plot.crop?.fertilized && visual !== 'withered') {
    setTextureIfChanged(view.badge, FERTILIZED_BADGE_KEY);
    view.badge.setOrigin(0.5, 0.5).setPosition(x + 12, y - 12).setDepth(depth + 0.5).setVisible(true);
  } else {
    view.badge.setVisible(false);
  }
  if (visual === null || !plot.crop || !lookup(content.crops, plot.crop.cropId)) {
    view.crop.setVisible(false);
    return;
  }
  setTextureIfChanged(view.crop, cropKey(plot.crop.cropId, visual));
  view.crop.setPosition(x, y).setDepth(depth).setVisible(true);
}

function updateItem(scene: Phaser.Scene, view: ItemView, entity: ItemEntity, gameNow: number, content: Content, options: ViewOptions): void {
  const fp = footprintOf(entity, content);
  const depth = depthOf(fp.x + fp.w - 1, fp.y + fp.h - 1);
  const anchor = tileToWorld(fp.x + (fp.w - 1) / 2, fp.y + (fp.h - 1) / 2);
  let topY: number;

  if (entity.kind === 'tree' || entity.kind === 'animal') {
    const ready = gameNow >= entity.readyAt;
    setTextureIfChanged(view.image, entity.kind === 'tree' ? treeKey(entity.itemId, ready) : animalKey(entity.itemId));
    view.image.setOrigin(0.5, TALL_TEX_CENTER_Y / TALL_TEX_H);
    topY = anchor.y - (entity.kind === 'tree' ? 66 : 30);
  } else {
    const item = lookup(content.placeables, entity.itemId);
    const key = ensureDecorationTexture(scene, entity.itemId, item?.width ?? 1, item?.height ?? 1, entity.rotated);
    setTextureIfChanged(view.image, key);
    const art = decorationArt(entity.itemId);
    const origin = decorationOrigin(fp.w, fp.h, art.height, entity.itemId);
    view.image.setOrigin(origin.x, origin.y);
    topY = anchor.y - art.height - (art.roofHeight ?? 0) - 4;
  }
  view.image.setPosition(anchor.x, anchor.y).setDepth(depth);
  const frame = entity.kind === 'building' && entity.parts !== undefined;
  if (frame) view.image.setTint(0xd7c4a0);
  else view.image.clearTint();

  // One bubble at most: helped (visiting) > needs parts > ready to collect.
  const marker = options.helped
    ? HELPED_MARKER_KEY
    : frame
      ? BUILD_MARKER_KEY
      : entity.kind !== 'decoration' && isProducing(entity, gameNow)
        ? READY_MARKER_KEY
        : null;
  view.marker.setVisible(marker !== null);
  if (marker) {
    setTextureIfChanged(view.marker, marker);
    view.marker.setPosition(anchor.x, topY).setDepth(depth + 0.5);
  }
}
