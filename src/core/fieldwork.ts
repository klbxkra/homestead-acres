/** Plots and crops (PLAN.md section 4.2). */
import { allocateId, lookup } from './ids';
import { inBounds, reject, spend } from './context';
import type { Ctx, Tile } from './context';
import { recordContractHarvest } from './contracts';
import { cropStatus } from './crops';
import { cropGrowMs, cropHarvestValue, cropPlantXp, cropSeedCost, plowCost, plowXp } from './economy';
import { entityAt } from './grid';
import { gainXp } from './progression';
import { addCounter, isMastered, recordCropHarvest, rollCollectibles } from './rewards';
import type { PlotEntity } from './state';

export function plotAt(ctx: Ctx, at: Tile): PlotEntity {
  if (!inBounds(ctx, at)) reject('out_of_bounds', 'That spot is outside the farm.');
  const entity = entityAt(ctx.farm, at.x, at.y, ctx.content);
  if (!entity) reject('not_plowed', 'Plow this spot first.');
  if (entity.kind !== 'plot') reject('occupied', 'Something is already here.');
  return entity;
}

/** Plow grass into a new plot, re-plow a fallow plot, or plow over withered crops. */
export function plow(ctx: Ctx, at: Tile): void {
  const { farm, content, rules } = ctx;
  if (!inBounds(ctx, at)) reject('out_of_bounds', 'That spot is outside the farm.');
  const existing = entityAt(farm, at.x, at.y, content);
  let plot: PlotEntity;
  if (!existing) {
    plot = { kind: 'plot', id: '', ownerId: ctx.player.id, x: at.x, y: at.y, plowed: false, crop: null };
  } else if (existing.kind !== 'plot') {
    reject('occupied', 'Something is already here.');
  } else {
    plot = existing;
    if (plot.crop && cropStatus(plot.crop, ctx.now, rules) !== 'withered') reject('occupied', 'A crop is growing here.');
    if (!plot.crop && plot.plowed) reject('already_plowed', 'This plot is already plowed.');
  }

  const cost = plowCost(content, rules);
  spend(ctx, cost);
  if (!existing) {
    plot.id = allocateId(ctx.state, 'plot');
    farm.entities[plot.id] = plot;
  }
  plot.plowed = true;
  plot.crop = null;
  ctx.events.push({ type: 'plowed', x: at.x, y: at.y, entityId: plot.id, cost });
  gainXp(ctx.player, plowXp(content, rules), content.levels, rules, ctx.events);
  addCounter(ctx, 'plowed');
  rollCollectibles(ctx, { plow: true }, at);
}

export function plant(ctx: Ctx, at: Tile, cropId: string): void {
  const { content, rules, player } = ctx;
  const crop = lookup(content.crops, cropId) ?? reject('unknown_item', `Unknown crop "${cropId}".`);
  if (player.level < crop.unlockLevel) reject('locked', `${crop.name} unlocks at level ${crop.unlockLevel}.`);
  const plot = plotAt(ctx, at);
  if (plot.crop) reject('occupied', 'Something is already planted here.');
  if (!plot.plowed) reject('not_plowed', 'Plow this plot first.');

  const discount = isMastered(ctx, cropId) ? content.base.mastery.seedDiscount : 0;
  const cost = cropSeedCost(crop, rules, discount);
  spend(ctx, cost);
  plot.crop = { cropId, plantedAt: ctx.now, readyAt: ctx.now + cropGrowMs(crop, rules) };
  ctx.events.push({ type: 'planted', x: at.x, y: at.y, entityId: plot.id, cropId, cost });
  gainXp(player, cropPlantXp(crop, rules), content.levels, rules, ctx.events);
}

export function harvestCrop(ctx: Ctx, plot: PlotEntity, at: Tile): void {
  const { content, rules, player } = ctx;
  if (!plot.crop) reject('no_crop', 'Nothing is planted here.');
  const status = cropStatus(plot.crop, ctx.now, rules);
  if (status === 'growing') reject('not_ripe', 'This crop is not ready yet.');
  if (status === 'withered') reject('withered', 'This crop has withered. Plow over it to clear it.');

  const { cropId } = plot.crop;
  const crop = lookup(content.crops, cropId);
  const coins = crop ? cropHarvestValue(crop, rules, plot.crop.fertilized === true, content) : 0; // a crop removed from content still clears
  player.coins += coins;
  plot.crop = null;
  plot.plowed = rules.keepPlowedAfterHarvest;
  ctx.events.push({ type: 'harvested', x: at.x, y: at.y, entityId: plot.id, cropId, coins });
  recordCropHarvest(ctx, cropId, coins);
  recordContractHarvest(ctx, cropId);
  rollCollectibles(ctx, { crop: cropId }, at);
}
