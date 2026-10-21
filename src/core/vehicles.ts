/** Vehicles and fuel (PLAN.md section 4.6). */
import type { Content, VehicleDef } from '../content';
import { inBounds, Rejection, reject, spend, spendCash } from './context';
import type { Ctx, Tile } from './context';
import { cropStatus } from './crops';
import { vehicleCost } from './economy';
import { harvestCrop, plant, plow } from './fieldwork';
import { entityAt } from './grid';
import { lookup } from './ids';
import type { WorldRules } from './rules';
import type { FarmState, FuelState } from './state';
import { HOUR_MS } from './time';

/** Tank size: the base tank plus every finished garage. */
export function fuelCapacity(farm: FarmState, content: Content): number {
  let max = content.base.fuelMax;
  for (const e of Object.values(farm.entities)) {
    if (e.kind === 'building' && e.parts === undefined) max += lookup(content.buildings, e.itemId)?.fuelBonus ?? 0;
  }
  return max;
}

/** Fuel available at game time `now` (it regenerates per game hour, up to the tank size `max`). */
export function fuelAt(fuel: FuelState, now: number, rules: WorldRules, content: Content, max = content.base.fuelMax): number {
  if (fuel.amount >= max) return fuel.amount;
  const regen = (Math.max(0, now - fuel.updatedAt) / HOUR_MS) * rules.fuelRegenPerHour;
  return Math.min(max, fuel.amount + regen);
}

/** Farm Cash needed to fill the tank right now. */
export function refuelCost(fuel: FuelState, now: number, rules: WorldRules, content: Content, max = content.base.fuelMax): number {
  const missing = max - fuelAt(fuel, now, rules, content, max);
  return missing <= 0 ? 0 : Math.ceil(missing / content.base.fuelPerCash);
}

export function buyVehicle(ctx: Ctx, vehicleId: string): void {
  const vehicle = lookup(ctx.content.vehicles, vehicleId) ?? reject('unknown_item', 'Unknown vehicle.');
  if (ctx.player.vehicles.includes(vehicleId)) reject('already_owned', `You already own a ${vehicle.name}.`);
  if (ctx.player.level < vehicle.unlockLevel) reject('locked', `${vehicle.name} unlocks at level ${vehicle.unlockLevel}.`);
  const cost = vehicleCost(vehicle, ctx.rules);
  spend(ctx, cost);
  ctx.player.vehicles.push(vehicleId);
  ctx.events.push({ type: 'vehicleBought', vehicleId, cost });
}

export function refuel(ctx: Ctx): void {
  const max = fuelCapacity(ctx.farm, ctx.content);
  const cash = refuelCost(ctx.player.fuel, ctx.now, ctx.rules, ctx.content, max);
  if (cash === 0) reject('nothing_to_do', 'The tank is already full.');
  spendCash(ctx, cash);
  ctx.player.fuel = { amount: max, updatedAt: ctx.now };
  ctx.events.push({ type: 'refueled', cash, fuel: max });
}

/**
 * Runs a vehicle over an area x area square (top corner at `at`). Each tile gets
 * the vehicle's actions in order (harvest -> plow -> plant), paying the usual
 * coins; tiles where nothing applies are skipped. Fuel is only used if at least
 * one tile was worked.
 */
export function useVehicle(ctx: Ctx, vehicleId: string, at: Tile, cropId: string | undefined): void {
  const vehicle = lookup(ctx.content.vehicles, vehicleId) ?? reject('unknown_item', 'Unknown vehicle.');
  if (!ctx.player.vehicles.includes(vehicleId)) reject('not_owned', `You don't own a ${vehicle.name}.`);
  if (vehicle.actions.length === 1 && vehicle.actions[0] === 'plant' && !cropId) reject('invalid', 'Choose seeds for the seeder first.');
  const fuel = fuelAt(ctx.player.fuel, ctx.now, ctx.rules, ctx.content, fuelCapacity(ctx.farm, ctx.content));
  if (fuel < vehicle.fuelPerUse) reject('no_fuel', `Out of fuel. It refills over time, or use Farm Cash.`);

  let worked = 0;
  let brokeOn: Rejection | null = null;
  outer: for (let dy = 0; dy < vehicle.area; dy++) {
    for (let dx = 0; dx < vehicle.area; dx++) {
      const t = { x: at.x + dx, y: at.y + dy };
      if (!inBounds(ctx, t)) continue;
      const result = workTile(ctx, vehicle, t, cropId);
      if (result.worked) worked++;
      if (result.stop) {
        brokeOn = result.stop; // e.g. ran out of coins: keep the tiles already done
        break outer;
      }
    }
  }
  if (worked === 0) {
    if (brokeOn) throw brokeOn;
    reject('nothing_to_do', `Nothing for the ${vehicle.name} to do there.`);
  }
  ctx.player.fuel = { amount: fuel - vehicle.fuelPerUse, updatedAt: ctx.now };
  ctx.events.push({ type: 'vehicleUsed', vehicleId, tiles: worked, fuel: vehicle.fuelPerUse });
}

/** Rejections that end the whole run rather than just skipping a tile. */
const STOPPING = new Set(['insufficient_coins', 'locked', 'unknown_item']);

/**
 * Applies each of the vehicle's actions to one tile. Handlers validate before
 * changing anything, so a rejected action is simply skipped; running out of
 * coins (or a locked crop) stops the run.
 */
function workTile(ctx: Ctx, vehicle: VehicleDef, t: Tile, cropId: string | undefined): { worked: boolean; stop: Rejection | null } {
  let worked = false;
  for (const action of vehicle.actions) {
    const entity = entityAt(ctx.farm, t.x, t.y, ctx.content);
    try {
      if (action === 'harvest') {
        if (entity?.kind !== 'plot' || !entity.crop || cropStatus(entity.crop, ctx.now, ctx.rules) !== 'ripe') continue;
        harvestCrop(ctx, entity, t);
      } else if (action === 'plow') {
        plow(ctx, t);
      } else {
        if (!cropId) continue;
        plant(ctx, t, cropId);
      }
      worked = true;
    } catch (e) {
      if (!(e instanceof Rejection)) throw e;
      if (STOPPING.has(e.code)) return { worked, stop: e };
    }
  }
  return { worked, stop: null };
}
