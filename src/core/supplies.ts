/**
 * Supplies and construction (PLAN.md sections 4.2 and 4.5): consumables bought in
 * the market or sent by neighbours (Fertilizer, Instagrow, Unwither Tonic, Fuel
 * Can), and building parts that finish construction buildings. All of them live
 * in the gift box.
 */
import type { SupplyDef } from '../content';
import { bump, countOf, inBounds, reject, spend, spendCash, takeFrom, tile } from './context';
import type { Ctx, Tile } from './context';
import { cropStatus } from './crops';
import { supplyPrice } from './economy';
import { lookup } from './ids';
import { addCounter } from './rewards';
import type { CropInstance, PlotEntity } from './state';
import { fuelAt, fuelCapacity } from './vehicles';

const MAX_BUY = 99;

function supply(ctx: Ctx, itemId: string): SupplyDef {
  return lookup(ctx.content.supplies, itemId) ?? reject('unknown_item', `Unknown supply "${itemId}".`);
}

export function buySupply(ctx: Ctx, itemId: string, count: number): void {
  const def = supply(ctx, itemId);
  if (!Number.isInteger(count) || count < 1 || count > MAX_BUY) reject('invalid', `Buy between 1 and ${MAX_BUY} at a time.`);
  if (ctx.player.level < def.unlockLevel) reject('locked', `${def.name} unlocks at level ${def.unlockLevel}.`);
  const price = supplyPrice(def, ctx.rules);
  const coins = price.coins * count;
  const cash = price.cash * count;
  if (ctx.player.coins < coins) reject('insufficient_coins', `Needs ${coins.toLocaleString('en-US')} coins.`);
  if (ctx.player.cash < cash) reject('insufficient_cash', `Needs ${cash} Farm Cash.`);
  spend(ctx, coins);
  spendCash(ctx, cash);
  bump(ctx.player.giftBox, itemId, count);
  ctx.events.push({ type: 'supplyBought', itemId, count, coins, cash });
}

/** Moves a crop's timeline so it is ripe at `now`, keeping its grow time (and so its ripe window). */
function ripenNow(crop: CropInstance, now: number): void {
  const shift = now - crop.readyAt;
  crop.plantedAt += shift;
  crop.readyAt += shift;
}

function plotsInArea(ctx: Ctx, at: Tile, area: number): PlotEntity[] {
  const out: PlotEntity[] = [];
  for (const e of Object.values(ctx.farm.entities)) {
    if (e.kind === 'plot' && e.x >= at.x && e.x < at.x + area && e.y >= at.y && e.y < at.y + area) out.push(e);
  }
  return out;
}

export function useSupply(ctx: Ctx, itemId: string, x: unknown, y: unknown): void {
  const def = supply(ctx, itemId);
  if (countOf(ctx.player.giftBox, itemId) < 1) reject('not_in_inventory', `You don't have any ${def.name}.`);
  const { farm, rules, now } = ctx;
  let affected = 0;
  let at: Tile | null = null;

  switch (def.kind) {
    case 'part':
      return reject('invalid', 'Building parts are added to a construction building, not used on their own.');
    case 'fertilizer':
    case 'instagrow': {
      at = tile(x, y);
      if (!inBounds(ctx, at)) reject('out_of_bounds', 'That spot is outside the farm.');
      for (const plot of plotsInArea(ctx, at, def.area ?? 1)) {
        const crop = plot.crop;
        if (!crop || cropStatus(crop, now, rules) !== 'growing') continue;
        if (def.kind === 'fertilizer') {
          if (crop.fertilized) continue;
          crop.fertilized = true;
        } else {
          ripenNow(crop, now);
        }
        affected++;
      }
      if (!affected) reject('nothing_to_do', def.kind === 'fertilizer' ? 'No unfertilized growing crops there.' : 'No growing crops there.');
      break;
    }
    case 'unwither':
      for (const e of Object.values(farm.entities)) {
        if (e.kind === 'plot' && e.crop && cropStatus(e.crop, now, rules) === 'withered') {
          ripenNow(e.crop, now);
          affected++;
        }
      }
      if (!affected) reject('nothing_to_do', 'Nothing on your farm has withered.');
      break;
    case 'fuel': {
      const max = fuelCapacity(farm, ctx.content);
      const current = fuelAt(ctx.player.fuel, now, rules, ctx.content, max);
      if (current >= max) reject('nothing_to_do', 'The tank is already full.');
      const next = Math.min(max, current + (def.amount ?? 0));
      affected = Math.round((next - current) * 10) / 10;
      ctx.player.fuel = { amount: next, updatedAt: now };
      break;
    }
  }

  takeFrom(ctx.player.giftBox, itemId);
  ctx.events.push({ type: 'supplyUsed', itemId, affected, x: at?.x ?? null, y: at?.y ?? null });
}

/** Parts a construction building still needs (part id -> count), or null if it isn't under construction. */
export function missingParts(ctx: Pick<Ctx, 'content'>, entity: { itemId: string; parts?: Record<string, number> }): Record<string, number> | null {
  if (!entity.parts) return null;
  const need = lookup(ctx.content.buildings, entity.itemId)?.construction ?? {};
  const out: Record<string, number> = {};
  for (const [part, n] of Object.entries(need)) {
    const left = n - countOf(entity.parts, part);
    if (left > 0) out[part] = left;
  }
  return out;
}

/** Adds whatever needed parts are in the gift box; finishing the building makes it work. */
export function addParts(ctx: Ctx, entityId: string): void {
  const entity = lookup(ctx.farm.entities, entityId) ?? reject('unknown_entity', 'That building is not on this farm.');
  if (entity.kind !== 'building' || !entity.parts) reject('nothing_to_do', 'That isn\'t under construction.');
  const missing = missingParts(ctx, entity)!;
  let added = 0;
  for (const [part, need] of Object.entries(missing)) {
    const take = Math.min(need, countOf(ctx.player.giftBox, part));
    if (take <= 0) continue;
    takeFrom(ctx.player.giftBox, part, take);
    bump(entity.parts, part, take);
    added += take;
  }
  if (!added) reject('not_in_inventory', 'You don\'t have any of the parts it needs. Neighbors send them, or buy them in the market.');
  const stillMissing = Object.values(missingParts(ctx, entity)!).reduce((a, b) => a + b, 0);
  ctx.events.push({ type: 'partsAdded', entityId, added, missing: stillMissing });
  if (stillMissing === 0) {
    delete entity.parts;
    ctx.events.push({ type: 'constructionCompleted', entityId, itemId: entity.itemId });
    addCounter(ctx, 'buildingsBuilt');
  }
}
