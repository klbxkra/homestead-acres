/**
 * Plays the game from level 1 with a simple strategy, through the real reducer,
 * as an end-to-end check that progression works and the balance is sane
 * (PLAN.md Phase 5: "playthrough from level 1 to 10").
 */
import { describe, expect, it } from 'vitest';
import {
  cropGrowMs,
  cropHarvestCoins,
  cropSeedCost,
  cropStatus,
  dailyStatus,
  HOUR_MS,
  isProducing,
  itemCost,
  plowCost,
} from '../../src/core';
import type { CropDef } from '../../src/content';
import type { WorldRules } from '../../src/core';
import { Harness } from './harness';

interface Report {
  level: number;
  gameHours: number;
  actions: number;
  coins: number;
  harvested: number;
  owned: string[];
}

/** A farmer who checks in every `checkEveryHours` of game time. */
function play(rules: Partial<WorldRules>, targetLevel: number, maxGameHours: number, checkEveryHours: number): Report {
  const h = new Harness(rules);
  const start = h.gameNow;
  let actions = 0;
  const act = (c: Parameters<Harness['run']>[0]) => {
    const r = h.run(c);
    if (r.ok) {
      h.state = r.state;
      actions++;
    }
    return r.ok;
  };

  /** Best coins per hour among crops we can afford right now. */
  const bestCrop = (): CropDef | null => {
    const r = h.state.rules;
    let best: CropDef | null = null;
    let bestRate = -Infinity;
    for (const c of Object.values(h.content.crops)) {
      if (c.unlockLevel > h.player.level) continue;
      const cost = cropSeedCost(c, r);
      if (cost > h.player.coins) continue;
      // Only plant what will ripen before the next check-in plus its ripe window, so nothing withers.
      if (cropGrowMs(c, r) > checkEveryHours * HOUR_MS * 4) continue;
      const rate = (cropHarvestCoins(c, r) - cost) / (cropGrowMs(c, r) / HOUR_MS);
      if (rate > bestRate) {
        bestRate = rate;
        best = c;
      }
    }
    return best;
  };

  while (h.player.level < targetLevel && h.gameNow - start < maxGameHours * HOUR_MS) {
    const rulesNow = h.state.rules;
    if (dailyStatus(h.player, h.realNow, h.content).available) act({ type: 'claimDailyBonus' });

    // Collect from everything that's ready.
    for (const e of Object.values(h.farm.entities)) {
      if (e.kind === 'plot' && e.crop && cropStatus(e.crop, h.gameNow, rulesNow) === 'ripe') act({ type: 'harvest', x: e.x, y: e.y });
      else if (e.kind !== 'plot' && isProducing(e, h.gameNow)) act({ type: 'harvest', x: e.x, y: e.y });
    }

    // Keep a reserve, then plant every plot on the first rows; trees and animals go at the back.
    for (let y = 0; y < h.farm.height - 3; y++) {
      for (let x = 0; x < h.farm.width; x++) {
        const plot = h.plot(x, y);
        const other = h.entityAt(x, y);
        if (other && other.kind !== 'plot') continue;
        const crop = bestCrop();
        if (!crop) continue;
        const status = plot?.crop ? cropStatus(plot.crop, h.gameNow, rulesNow) : null;
        if (!plot || !plot.plowed || status === 'withered') {
          if (h.player.coins < plowCost(h.content, rulesNow) + cropSeedCost(crop, rulesNow)) continue;
          act({ type: 'plow', x, y });
        }
        if (h.plot(x, y)?.plowed && !h.plot(x, y)?.crop) act({ type: 'plant', x, y, cropId: crop.id });
      }
    }

    // Spare coins: an apple tree or a chicken in the back rows.
    for (const itemId of ['apple_tree', 'chicken']) {
      const item = h.content.placeables[itemId]!;
      if (h.player.level >= item.unlockLevel && h.player.coins > itemCost(item, rulesNow) * 4) {
        for (let x = 0; x < h.farm.width; x++) {
          const y = h.farm.height - 1 - (itemId === 'chicken' ? 1 : 0);
          if (!h.entityAt(x, y) && act({ type: 'buy', itemId, x, y })) break;
        }
      }
    }

    h.advance((checkEveryHours * HOUR_MS) / rulesNow.timeScale, { asOneGap: true });
  }

  const p = h.player;
  return {
    level: p.level,
    gameHours: Math.round((h.gameNow - start) / HOUR_MS),
    actions,
    coins: p.coins,
    harvested: p.stats.counters['cropsHarvested'] ?? 0,
    owned: Object.values(h.farm.entities).flatMap((e) => (e.kind === 'plot' ? [] : [e.itemId])),
  };
}

describe('playthrough', () => {
  it('reaches level 10 on Speed run in a few in-game days', () => {
    const r = play({ preset: 'speedrun', timeScale: 600, xpGain: 5, startingCoins: 1000 }, 10, 24 * 14, 2);
    expect(r.level).toBeGreaterThanOrEqual(10);
    expect(r.gameHours).toBeLessThan(24 * 4);
    expect(r.coins).toBeGreaterThan(0);
  });

  it('reaches level 10 on Classic within two in-game weeks for a farmer checking in every 4 hours', () => {
    const r = play({}, 10, 24 * 30, 4);
    console.info('Classic playthrough to level 10:', JSON.stringify(r));
    expect(r.level).toBeGreaterThanOrEqual(10);
    expect(r.gameHours).toBeLessThan(24 * 14);
    expect(r.harvested).toBeGreaterThan(100);
  });
});
