/**
 * Every price, yield, timer and XP value goes through here (PLAN.md section 5):
 * value = (per-item override ?? base) x global multiplier. Nothing else reads raw content numbers.
 */
import type { Content, CropDef, DecorationDef } from '../content';
import { lookup } from './ids';
import type { ItemOverride, WorldRules } from './rules';

function override(rules: WorldRules, itemId: string): ItemOverride | undefined {
  return lookup(rules.overrides, itemId);
}

/** Coins are always whole and never negative. */
function coins(value: number): number {
  return Math.max(0, Math.round(value));
}

export function cropGrowMs(crop: CropDef, rules: WorldRules): number {
  const base = override(rules, crop.id)?.growMs ?? crop.growMs;
  return Math.max(1, Math.round(base * rules.cropGrowth));
}

export function cropSeedCost(crop: CropDef, rules: WorldRules): number {
  return coins((override(rules, crop.id)?.cost ?? crop.cost) * rules.buyCost);
}

export function cropHarvestCoins(crop: CropDef, rules: WorldRules): number {
  return coins((override(rules, crop.id)?.sellPrice ?? crop.sellPrice) * rules.coinYield);
}

/** XP is awarded when planting, as in FV1. */
export function cropPlantXp(crop: CropDef, rules: WorldRules): number {
  return (override(rules, crop.id)?.xp ?? crop.xp) * rules.xpGain;
}

export function plowCost(content: Content, rules: WorldRules): number {
  return coins(content.base.plowCost * rules.plowCost);
}

export function plowXp(content: Content, rules: WorldRules): number {
  return content.base.plowXp * rules.xpGain;
}

export function decorationCost(item: DecorationDef, rules: WorldRules): number {
  return coins((override(rules, item.id)?.cost ?? item.cost) * rules.buyCost);
}

export function decorationXp(item: DecorationDef, rules: WorldRules): number {
  return (override(rules, item.id)?.xp ?? item.xp) * rules.xpGain;
}

/** Selling back refunds a fraction of the current purchase price. */
export function decorationRefund(item: DecorationDef, content: Content, rules: WorldRules): number {
  return coins(decorationCost(item, rules) * content.base.sellRefundFactor);
}
