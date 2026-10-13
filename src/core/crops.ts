/** Crop lifecycle, derived from timestamps (PLAN.md section 4.2). */
import type { CropInstance, PlotEntity } from './state';
import type { WorldRules } from './rules';

export type CropStatus = 'growing' | 'ripe' | 'withered';
export type PlotStatus = 'fallow' | 'plowed' | CropStatus;

/** Number of visual growth stages before ripe (e.g. sprout, young, nearly ripe). */
export const GROWTH_STAGES = 3;

export function cropGrowMsOf(crop: CropInstance): number {
  return crop.readyAt - crop.plantedAt;
}

/**
 * Game time the crop withers, or null if it never will. Derived from the
 * current rules, so turning withering off applies to crops already planted.
 */
export function cropWitherAt(crop: CropInstance, rules: WorldRules): number | null {
  if (!rules.witherEnabled) return null;
  return crop.readyAt + cropGrowMsOf(crop) * rules.witherWindowFactor;
}

export function cropStatus(crop: CropInstance, gameNow: number, rules: WorldRules): CropStatus {
  if (gameNow < crop.readyAt) return 'growing';
  const witherAt = cropWitherAt(crop, rules);
  return witherAt === null || gameNow < witherAt ? 'ripe' : 'withered';
}

/** 0 at planting, 1 when ripe. */
export function cropProgress(crop: CropInstance, gameNow: number): number {
  const total = cropGrowMsOf(crop);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (gameNow - crop.plantedAt) / total));
}

/** 0..GROWTH_STAGES-1 while growing; GROWTH_STAGES when ripe or later. */
export function cropStage(crop: CropInstance, gameNow: number): number {
  const p = cropProgress(crop, gameNow);
  return p >= 1 ? GROWTH_STAGES : Math.min(GROWTH_STAGES - 1, Math.floor(p * GROWTH_STAGES));
}

export function plotStatus(plot: PlotEntity, gameNow: number, rules: WorldRules): PlotStatus {
  if (plot.crop) return cropStatus(plot.crop, gameNow, rules);
  return plot.plowed ? 'plowed' : 'fallow';
}
