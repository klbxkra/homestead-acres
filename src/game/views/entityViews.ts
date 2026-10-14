/** Sprites for farm entities, kept in sync with game state. */
import Phaser from 'phaser';
import type { Content } from '../../content';
import { cropStage, cropStatus, footprintOf, lookup } from '../../core';
import type { DecorationEntity, Entity, PlotEntity, WorldRules } from '../../core';
import { decorationArt } from '../art/artData';
import {
  CROP_TEX_CENTER_Y,
  CROP_TEX_H,
  cropKey,
  decorationOrigin,
  ensureDecorationTexture,
  soilKey,
  TEX_SCALE,
} from '../art/textures';
import type { CropVisual } from '../art/textures';
import { depthOf, tileToWorld } from '../iso';

/** Depth bands: ground < soil < hover outline < objects (sorted by iso depth) < ghost < effects. */
export const DEPTH = { ground: -30, soil: -20, highlight: -10, ghost: 10_000, fx: 20_000 } as const;

export interface PlotView {
  kind: 'plot';
  soil: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
}

export interface DecorationView {
  kind: 'decoration';
  image: Phaser.GameObjects.Image;
}

export type EntityView = PlotView | DecorationView;

export function createView(scene: Phaser.Scene, entity: Entity): EntityView {
  if (entity.kind === 'plot') {
    const soil = scene.add.image(0, 0, soilKey(true)).setScale(1 / TEX_SCALE).setDepth(DEPTH.soil);
    const crop = scene.add
      .image(0, 0, '__DEFAULT')
      .setScale(1 / TEX_SCALE)
      .setOrigin(0.5, CROP_TEX_CENTER_Y / CROP_TEX_H)
      .setVisible(false);
    return { kind: 'plot', soil, crop };
  }
  const image = scene.add.image(0, 0, '__DEFAULT').setScale(1 / TEX_SCALE);
  return { kind: 'decoration', image };
}

export function updateView(
  scene: Phaser.Scene,
  view: EntityView,
  entity: Entity,
  gameNow: number,
  rules: WorldRules,
  content: Content,
): void {
  if (view.kind === 'plot' && entity.kind === 'plot') updatePlot(view, entity, gameNow, rules, content);
  else if (view.kind === 'decoration' && entity.kind === 'decoration') updateDecoration(scene, view, entity, content);
}

export function destroyView(view: EntityView): void {
  if (view.kind === 'plot') {
    view.soil.destroy();
    view.crop.destroy();
  } else {
    view.image.destroy();
  }
}

export function setViewAlpha(view: EntityView, alpha: number): void {
  if (view.kind === 'plot') {
    view.soil.setAlpha(alpha);
    view.crop.setAlpha(alpha);
  } else {
    view.image.setAlpha(alpha);
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

function updatePlot(view: PlotView, plot: PlotEntity, gameNow: number, rules: WorldRules, content: Content): void {
  const { x, y } = tileToWorld(plot.x, plot.y);
  view.soil.setPosition(x, y);
  setTextureIfChanged(view.soil, soilKey(plot.plowed || plot.crop !== null));

  const visual = cropVisual(plot, gameNow, rules);
  if (visual === null || !plot.crop || !lookup(content.crops, plot.crop.cropId)) {
    view.crop.setVisible(false);
    return;
  }
  setTextureIfChanged(view.crop, cropKey(plot.crop.cropId, visual));
  view.crop.setPosition(x, y).setDepth(depthOf(plot.x, plot.y)).setVisible(true);
}

function updateDecoration(scene: Phaser.Scene, view: DecorationView, deco: DecorationEntity, content: Content): void {
  const item = lookup(content.decorations, deco.itemId);
  const fp = footprintOf(deco, content);
  const key = ensureDecorationTexture(scene, deco.itemId, item?.width ?? 1, item?.height ?? 1, deco.rotated);
  setTextureIfChanged(view.image, key);
  const origin = decorationOrigin(fp.w, fp.h, decorationArt(deco.itemId).height);
  const { x, y } = tileToWorld(fp.x + (fp.w - 1) / 2, fp.y + (fp.h - 1) / 2);
  view.image
    .setOrigin(origin.x, origin.y)
    .setPosition(x, y)
    .setDepth(depthOf(fp.x + fp.w - 1, fp.y + fp.h - 1));
}
