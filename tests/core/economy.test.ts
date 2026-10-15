import { describe, expect, it } from 'vitest';
import { defaultContent } from '../../src/content';
import {
  cropHarvestCoins,
  cropPlantXp,
  cropSeedCost,
  itemCost as decorationCost,
  itemRefund,
  plowCost,
  plowXp,
  rulesForPreset,
} from '../../src/core';
import type { WorldRules } from '../../src/core';

const rules = (patch: Partial<WorldRules> = {}): WorldRules => ({ ...rulesForPreset('classic'), ...patch });
const strawberry = defaultContent.crops['strawberry']!;
const hayBale = defaultContent.placeables['hay_bale']!;
const decorationRefund = itemRefund;

describe('economy', () => {
  it('uses base values under classic rules', () => {
    expect(cropSeedCost(strawberry, rules())).toBe(10);
    expect(cropHarvestCoins(strawberry, rules())).toBe(35);
    expect(cropPlantXp(strawberry, rules())).toBe(1);
    expect(plowCost(defaultContent, rules())).toBe(15);
    expect(plowXp(defaultContent, rules())).toBe(1);
    expect(decorationCost(hayBale, rules())).toBe(20);
  });

  it('applies global multipliers, rounding coins to whole numbers', () => {
    expect(cropSeedCost(strawberry, rules({ buyCost: 1.25 }))).toBe(13); // 12.5 -> 13
    expect(cropHarvestCoins(strawberry, rules({ coinYield: 2 }))).toBe(70);
    expect(plowCost(defaultContent, rules({ plowCost: 0 }))).toBe(0);
    expect(decorationCost(hayBale, rules({ buyCost: 0.5 }))).toBe(10);
  });

  it('keeps XP fractional so small multipliers are not lost to rounding', () => {
    expect(cropPlantXp(strawberry, rules({ xpGain: 1.5 }))).toBe(1.5);
    expect(plowXp(defaultContent, rules({ xpGain: 0.25 }))).toBe(0.25);
  });

  it('per-item overrides replace the base value, and multipliers still apply', () => {
    const r = rules({ coinYield: 2, buyCost: 3, overrides: { strawberry: { sellPrice: 100, cost: 1, xp: 10 } } });
    expect(cropHarvestCoins(strawberry, r)).toBe(200);
    expect(cropSeedCost(strawberry, r)).toBe(3);
    expect(cropPlantXp(strawberry, r)).toBe(10);
  });

  it('refunds half the current price when selling a decoration', () => {
    expect(decorationRefund(hayBale, defaultContent, rules())).toBe(10);
    expect(decorationRefund(hayBale, defaultContent, rules({ buyCost: 2 }))).toBe(20);
  });
});
