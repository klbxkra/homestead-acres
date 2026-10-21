import { describe, expect, it } from 'vitest';
import { dailyStatus, HOUR_MS } from '../../src/core';
import { Harness } from './harness';

function harvestStrawberries(h: Harness, n: number) {
  for (let i = 0; i < n; i++) {
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    h.advanceHours(4);
    h.ok({ type: 'harvest', x: 0, y: 0 });
  }
}

describe('crop mastery', () => {
  it('awards stars at the thresholds, with coins, XP and a sign at 3 stars', () => {
    const h = new Harness({ masteryGoal: 0.1, collectibleDropRate: 0 }); // strawberry thresholds 30/100/250 -> 3/10/25
    h.cheat({ coins: 100_000 });
    harvestStrawberries(h, 2);
    expect(h.player.masteryStars['strawberry']).toBeUndefined();
    const coins = h.player.coins;
    harvestStrawberries(h, 1);
    expect(h.player.masteryStars['strawberry']).toBe(1);
    expect(h.player.coins).toBe(coins - 25 + 35 + 105); // plow + seed, harvest, star 1 = 35 x 3 x 1
    harvestStrawberries(h, 22);
    expect(h.player.masteryStars['strawberry']).toBe(3);
    expect(h.player.giftBox['mastery_sign']).toBe(1);
    expect(h.player.stats.counters['cropsMastered']).toBe(1);
    expect(h.player.ribbons['crop_expert']).toBe(1);
  });

  it('gives mastered crops a seed discount', () => {
    const h = new Harness({ masteryGoal: 0.01, collectibleDropRate: 0 }); // thresholds 30/100/250 -> 1/1/3
    h.cheat({ coins: 100_000, level: 10 });
    harvestStrawberries(h, 1);
    expect(h.player.masteryStars['strawberry']).toBe(2); // two stars from one harvest
    harvestStrawberries(h, 2);
    expect(h.player.masteryStars['strawberry']).toBe(3);
    h.ok({ type: 'plow', x: 1, y: 0 });
    const coins = h.player.coins;
    h.ok({ type: 'plant', x: 1, y: 0, cropId: 'strawberry' });
    expect(coins - h.player.coins).toBe(9); // 10 coins - 10%
  });
});

describe('ribbons', () => {
  it('awards each tier once, several at a time if a counter jumps', () => {
    const h = new Harness({ collectibleDropRate: 0 });
    h.cheat({ coins: 1_000_000 });
    for (let i = 0; i < 50; i++) h.ok({ type: 'plow', x: i % 12, y: Math.floor(i / 12) });
    expect(h.player.ribbons['plow_master']).toBe(1);
    expect(h.lastEvents).toContainEqual({ type: 'ribbonEarned', ribbonId: 'plow_master', tier: 1 });
    // Money Maker counts coins earned: jump straight past two tiers.
    h.state.players[h.state.localPlayerId]!.stats.counters['coinsEarned'] = 49_990;
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    h.advanceHours(4);
    const events = h.ok({ type: 'harvest', x: 0, y: 0 });
    expect(events.filter((e) => e.type === 'ribbonEarned' && e.ribbonId === 'money_maker').map((e) => (e.type === 'ribbonEarned' ? e.tier : 0))).toEqual([1, 2]);
  });
});

describe('collections', () => {
  it('drops collectibles from their sources with the seeded RNG and turns in complete sets', () => {
    const h = new Harness({ collectibleDropRate: 20 }); // 5% x 20 = always
    h.cheat({ coins: 1_000_000, level: 40 });
    h.fails({ type: 'turnInCollection', collectionId: 'old_tools' }, 'incomplete');
    let plowed = 0;
    while (Object.keys(h.player.collectibles).filter((k) => h.content.collectibleSet[k] === 'old_tools').length < 5) {
      h.ok({ type: 'plow', x: plowed % 12, y: Math.floor(plowed / 12) % 12 });
      plowed++;
      if (plowed > 140) throw new Error('never completed the set');
    }
    const before = { ...h.player.collectibles };
    const coins = h.player.coins;
    h.ok({ type: 'turnInCollection', collectionId: 'old_tools' });
    expect(h.player.coins).toBe(coins + 1500 + 100); // set reward + the first Collector ribbon
    expect(h.player.ribbons['collector']).toBe(1);
    expect(h.player.giftBox['golden_hoe']).toBe(1);
    expect(h.player.collectibles['rusty_hoe']).toBe(before['rusty_hoe']! - 1);
    expect(h.player.stats.counters['collectionsCompleted']).toBe(1);
  });

  it('drops nothing at a zero drop rate', () => {
    const h = new Harness({ collectibleDropRate: 0 });
    h.cheat({ coins: 100_000 });
    for (let i = 0; i < 40; i++) h.ok({ type: 'plow', x: i % 12, y: Math.floor(i / 12) });
    expect(h.player.collectibles).toEqual({});
  });

  it('is deterministic for the same seed and actions', () => {
    const run = () => {
      const h = new Harness({ collectibleDropRate: 5 });
      h.cheat({ coins: 100_000 });
      for (let i = 0; i < 30; i++) h.ok({ type: 'plow', x: i % 12, y: Math.floor(i / 12) });
      return h.player.collectibles;
    };
    expect(run()).toEqual(run());
  });
});

describe('daily bonus', () => {
  it('builds a streak once per real day, and resets after a missed day', () => {
    const h = new Harness({ timeScale: 600 }); // game time races; the bonus must not
    const claim = () => h.ok({ type: 'claimDailyBonus' }).find((e) => e.type === 'dailyBonus');
    expect(claim()).toMatchObject({ streak: 1, coins: 50 });
    h.advance(HOUR_MS); // 600 game hours, but only 1 real hour
    h.fails({ type: 'claimDailyBonus' }, 'not_ready');
    h.advance(20 * HOUR_MS);
    expect(claim()).toMatchObject({ streak: 2, coins: 100 });
    for (let day = 3; day <= 6; day++) {
      h.advance(24 * HOUR_MS);
      claim();
    }
    expect(h.player.daily.streak).toBe(6);
    expect(h.lastEvents).toContainEqual(expect.objectContaining({ type: 'dailyBonus', streak: 6, coins: 400, cash: 1 })); // capped at the last day's reward
    h.advance(72 * HOUR_MS);
    expect(dailyStatus(h.player, h.realNow, h.content).nextStreak).toBe(1);
    expect(claim()).toMatchObject({ streak: 1 });
  });
});

describe('farm expansion', () => {
  it('grows the farm through each size, gated by level and coins', () => {
    const h = new Harness();
    h.fails({ type: 'expandFarm' }, 'locked'); // 14x14 needs level 5
    h.cheat({ level: 5, coins: 4000 });
    h.fails({ type: 'expandFarm' }, 'insufficient_coins');
    h.cheat({ level: 50, coins: 10_000_000 });
    for (const size of [14, 16, 18, 20, 22, 24, 26]) {
      h.ok({ type: 'expandFarm' });
      expect(h.farm.width).toBe(size);
      expect(h.farm.height).toBe(size);
    }
    h.fails({ type: 'expandFarm' }, 'max_size');
    h.ok({ type: 'plow', x: 25, y: 25 });
  });
});
