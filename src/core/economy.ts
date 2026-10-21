/**
 * Every price, yield, timer and XP value goes through here (PLAN.md section 5):
 * value = (per-item override ?? base) x global multiplier. Nothing else reads raw content numbers.
 */
import type { AnimalDef, Content, ContractDef, CropDef, ExpansionDef, PlaceableInfo, SupplyDef, TreeDef, VehicleDef } from '../content';
import { lookup } from './ids';
import type { ItemOverride, WorldRules } from './rules';
import { HOUR_MS } from './time';

function override(rules: WorldRules, itemId: string): ItemOverride | undefined {
  return lookup(rules.overrides, itemId);
}

/** Coins are always whole and never negative. */
function coins(value: number): number {
  return Math.max(0, Math.round(value));
}

// ---------------------------------------------------------------- crops

export function cropGrowMs(crop: CropDef, rules: WorldRules): number {
  const base = override(rules, crop.id)?.growMs ?? crop.growMs;
  return Math.max(1, Math.round(base * rules.cropGrowth));
}

/** `discount` is the mastery seed discount (0..1) when the crop is mastered. */
export function cropSeedCost(crop: CropDef, rules: WorldRules, discount = 0): number {
  return coins((override(rules, crop.id)?.cost ?? crop.cost) * rules.buyCost * (1 - discount));
}

export function cropHarvestCoins(crop: CropDef, rules: WorldRules): number {
  return coins((override(rules, crop.id)?.sellPrice ?? crop.sellPrice) * rules.coinYield);
}

/** XP is awarded when planting, as in FV1. */
export function cropPlantXp(crop: CropDef, rules: WorldRules): number {
  return (override(rules, crop.id)?.xp ?? crop.xp) * rules.xpGain;
}

/** Harvests needed for mastery stars 1-3. */
export function masteryThresholds(crop: CropDef, rules: WorldRules): [number, number, number] {
  const scale = (n: number) => Math.max(1, Math.round(n * rules.masteryGoal));
  return [scale(crop.mastery[0]), scale(crop.mastery[1]), scale(crop.mastery[2])];
}

export function plowCost(content: Content, rules: WorldRules): number {
  return coins(content.base.plowCost * rules.plowCost);
}

export function plowXp(content: Content, rules: WorldRules): number {
  return content.base.plowXp * rules.xpGain;
}

// ---------------------------------------------------------------- placeable items

export function itemCost(item: PlaceableInfo, rules: WorldRules): number {
  return coins((override(rules, item.id)?.cost ?? item.cost) * rules.buyCost);
}

/** XP is awarded when buying. */
export function itemXp(item: PlaceableInfo, rules: WorldRules): number {
  return (override(rules, item.id)?.xp ?? item.xp) * rules.xpGain;
}

/** Selling back refunds a fraction of the current purchase price; reward-only items sell for nothing. */
export function itemRefund(item: PlaceableInfo, content: Content, rules: WorldRules): number {
  return item.buyable ? coins(itemCost(item, rules) * content.base.sellRefundFactor) : 0;
}

// ---------------------------------------------------------------- trees & animals

export function treeCycleMs(tree: TreeDef, rules: WorldRules): number {
  return Math.max(1, Math.round((override(rules, tree.id)?.growMs ?? tree.cycleMs) * rules.treeCycle));
}

export function animalCycleMs(animal: AnimalDef, rules: WorldRules): number {
  return Math.max(1, Math.round((override(rules, animal.id)?.growMs ?? animal.cycleMs) * rules.animalCycle));
}

/** Coins per harvest of a tree or animal. */
export function productionYield(def: TreeDef | AnimalDef, rules: WorldRules): number {
  return coins((override(rules, def.id)?.sellPrice ?? def.yield) * rules.coinYield);
}

// ---------------------------------------------------------------- vehicles & expansion

export function vehicleCost(vehicle: VehicleDef, rules: WorldRules): number {
  return coins((override(rules, vehicle.id)?.cost ?? vehicle.cost) * rules.buyCost);
}

export function expansionCost(expansion: ExpansionDef, rules: WorldRules): number {
  return coins(expansion.cost * rules.buyCost);
}

// ---------------------------------------------------------------- Phase 6: supplies, neighbours, co-op jobs

/** Price of one supply or part: coins scale with buyCost; Farm Cash prices are fixed (like refuelling). */
export function supplyPrice(supply: SupplyDef, rules: WorldRules): { coins: number; cash: number } {
  return { coins: coins((override(rules, supply.id)?.cost ?? supply.coins ?? 0) * rules.buyCost), cash: supply.cash ?? 0 };
}

/** Coins for harvesting a crop; fertilized crops pay a bonus on top. */
export function cropHarvestValue(crop: CropDef, rules: WorldRules, fertilized: boolean, content: Content): number {
  const value = cropHarvestCoins(crop, rules);
  return fertilized ? coins(value * (1 + content.base.fertilizeBonus)) : value;
}

export function neighborHelpCoins(content: Content, rules: WorldRules): number {
  return coins(content.base.neighbors.helpCoins * rules.coinYield);
}

export function neighborHelpXp(content: Content, rules: WorldRules): number {
  return content.base.neighbors.helpXp * rules.xpGain;
}

/** Game-time length of a co-op job. */
export function contractDurationMs(contract: ContractDef, rules: WorldRules): number {
  return Math.max(1, Math.round(contract.durationHours * HOUR_MS * rules.contractTime));
}
