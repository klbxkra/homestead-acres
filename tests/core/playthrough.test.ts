/**
 * Plays the game from level 1 with a simple strategy, through the real reducer,
 * as an end-to-end check that progression works and the balance is sane
 * (PLAN.md Phase 5: "playthrough from level 1 to 10").
 */
import { describe, expect, it } from 'vitest';
import {
  availableContracts,
  contractDef,
  contractStatus,
  contractTotal,
  cropGrowMs,
  cropHarvestCoins,
  cropSeedCost,
  cropStatus,
  dailyStatus,
  helpKindFor,
  helpsLeft,
  HOUR_MS,
  isProducing,
  itemCost,
  plowCost,
  visitedFarm,
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
  /** Phase 6 (with `social`): mailbox gifts accepted, neighbour helps, co-op medals. */
  giftsAccepted: number;
  helps: number;
  helpCoins: number;
  medals: string[];
}

/**
 * A farmer who checks in every `checkEveryHours` of game time. With `social`,
 * they also accept neighbours' gifts, help on every neighbour's farm and run
 * co-op jobs (planting the job's crops while one is open).
 */
function play(rules: Partial<WorldRules>, targetLevel: number, maxGameHours: number, checkEveryHours: number, social = false): Report {
  const h = new Harness(social ? { aiNeighborCount: 5, ...rules } : rules);
  let helps = 0;
  let helpCoins = 0;
  const medals: string[] = [];
  const start = h.gameNow;
  let actions = 0;
  const act = (c: Parameters<Harness['run']>[0]) => {
    const r = h.run(c);
    if (r.ok) {
      h.state = r.state;
      h.lastEvents = r.events;
      actions++;
    }
    return r.ok;
  };

  /** The crop an open co-op job still needs, if we can grow it in time. */
  const jobCrop = (): CropDef | null => {
    const c = h.player.contract;
    if (!c || contractStatus(c, h.gameNow) !== 'active') return null;
    for (const g of contractDef(h.content, c.contractId)?.goals ?? []) {
      const crop = h.content.crops[g.cropId]!;
      if (contractTotal(c, g.cropId) < g.count && crop.unlockLevel <= h.player.level && cropSeedCost(crop, h.state.rules) <= h.player.coins) return crop;
    }
    return null;
  };

  /** Best coins per hour among crops we can afford right now. */
  const bestCrop = (): CropDef | null => {
    const job = jobCrop();
    if (job) return job;
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
    if (social) {
      if (h.player.social.mailbox.length) act({ type: 'acceptGifts' });
      for (const n of h.player.social.neighbors) {
        const farm = visitedFarm(n, h.player, h.gameNow, h.content, h.state.rules);
        for (const e of Object.values(farm.entities)) {
          if (helpsLeft(h.player.social.neighbors.find((x) => x.id === n.id)!, h.gameNow, h.state.rules) === 0) break;
          if (!helpKindFor(e, h.gameNow, h.state.rules)) continue;
          const coins = h.player.coins;
          if (act({ type: 'helpNeighbor', neighborId: n.id, x: e.x, y: e.y })) {
            helps++;
            helpCoins += h.player.coins - coins;
          }
        }
      }
      const c = h.player.contract;
      if (c && contractStatus(c, h.gameNow) !== 'active') {
        const medal = contractStatus(c, h.gameNow) === 'complete';
        if (act({ type: 'claimContract' }) && medal) {
          const e = h.lastEvents.find((x) => x.type === 'contractClaimed');
          if (e?.type === 'contractClaimed') medals.push(`${e.contractId}:${e.medal}`);
        }
      }
      if (!h.player.contract) {
        // The newest job whose crops all grow within a check-in or two.
        const doable = availableContracts(h.player, h.content).filter((j) =>
          j.goals.every((g) => cropGrowMs(h.content.crops[g.cropId]!, h.state.rules) <= checkEveryHours * 2 * HOUR_MS),
        );
        const job = doable.at(-1);
        if (job) act({ type: 'startContract', contractId: job.id, partners: h.player.social.neighbors.slice(0, 2).map((n) => n.id) });
      }
    }

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
    giftsAccepted: p.stats.counters['giftsAccepted'] ?? 0,
    helps,
    helpCoins,
    medals,
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

  it('Phase 6: two weeks on Classic with neighbours gives a steady flow of gifts, helps and co-op medals', () => {
    const days = 14;
    const r = play({}, 99, 24 * days, 4, true);
    console.info('Classic social playthrough, 14 days:', JSON.stringify({ ...r, owned: r.owned.length }));
    // About 3 gifts a day plus a thank-you per neighbour per day for helping out, plus 2 welcome gifts.
    expect(r.giftsAccepted).toBeGreaterThan(days * 3);
    expect(r.giftsAccepted).toBeLessThan(days * 10);
    // Every neighbour helped 5 times a day; helps are pocket money next to farming.
    expect(r.helps).toBeGreaterThanOrEqual(days * 5 * 5 - 25);
    expect(r.helpCoins).toBeLessThan(r.coins + 50_000);
    expect(r.medals.length).toBeGreaterThanOrEqual(3);
    expect(r.medals.some((m) => m.endsWith(':gold'))).toBe(true);
  });
});
