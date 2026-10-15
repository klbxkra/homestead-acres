import { describe, expect, it } from 'vitest';
import { isProducing } from '../../src/core';
import { Harness } from './harness';

function setup(rules = {}) {
  const h = new Harness(rules);
  h.cheat({ level: 40, coins: 1_000_000 });
  return h;
}

describe('trees', () => {
  it('produce once per cycle and never wither', () => {
    const h = setup();
    h.ok({ type: 'buy', itemId: 'apple_tree', x: 0, y: 0 }); // 72h, 75 coins
    h.fails({ type: 'harvest', x: 0, y: 0 }, 'not_ripe');
    h.advanceHours(71.9);
    h.fails({ type: 'harvest', x: 0, y: 0 }, 'not_ripe');
    h.advanceHours(500); // waiting long does nothing bad
    expect(isProducing(h.entityAt(0, 0)!, h.gameNow)).toBe(true);
    const coins = h.player.coins;
    const events = h.ok({ type: 'harvest', x: 0, y: 0 });
    expect(h.player.coins).toBe(coins + 75);
    expect(events).toContainEqual(expect.objectContaining({ type: 'collected', itemId: 'apple_tree', coins: 75, count: 1 }));
    expect(h.player.stats.counters['treesHarvested']).toBe(1);
    h.fails({ type: 'harvest', x: 0, y: 0 }, 'not_ripe'); // next cycle started
  });

  it('follow the treeCycle rule, coin multiplier and per-tree overrides', () => {
    const h = setup({ treeCycle: 0.5, coinYield: 2, overrides: { lemon_tree: { growMs: 3_600_000, sellPrice: 10 } } });
    h.ok({ type: 'buy', itemId: 'apple_tree', x: 0, y: 0 });
    h.ok({ type: 'buy', itemId: 'lemon_tree', x: 1, y: 0 });
    h.advanceHours(0.5);
    const coins = h.player.coins;
    h.ok({ type: 'harvest', x: 1, y: 0 }); // 1h x 0.5
    expect(h.player.coins).toBe(coins + 20);
    h.advanceHours(35.5);
    h.ok({ type: 'harvest', x: 0, y: 0 }); // 72h x 0.5 = 36h
  });
});

describe('animals', () => {
  it('can be collected on their cycle, on their own or inside buildings', () => {
    const h = setup();
    h.ok({ type: 'buy', itemId: 'cow', x: 0, y: 0 }); // 24h, 70
    h.ok({ type: 'buy', itemId: 'chicken_coop', x: 4, y: 4 });
    h.ok({ type: 'buy', itemId: 'chicken', x: 4, y: 4 }); // 24h, 30
    h.advanceHours(12);
    h.ok({ type: 'buy', itemId: 'chicken', x: 4, y: 4 }); // ready 12h later than the first
    h.fails({ type: 'harvest', x: 4, y: 4 }, 'not_ripe');
    h.advanceHours(12);

    const coins = h.player.coins;
    h.ok({ type: 'harvest', x: 0, y: 0 });
    const events = h.ok({ type: 'harvest', x: 5, y: 5 }); // any tile of the coop
    expect(events).toContainEqual(expect.objectContaining({ type: 'collected', count: 1, coins: 30 }));
    expect(h.player.coins).toBe(coins + 70 + 30);
    h.advanceHours(12);
    h.ok({ type: 'harvest', x: 4, y: 4 }); // the second chicken
    expect(h.player.stats.counters['animalsCollected']).toBe(3);
  });

  it('an empty building has nothing to collect', () => {
    const h = setup();
    h.ok({ type: 'buy', itemId: 'chicken_coop', x: 0, y: 0 });
    h.fails({ type: 'harvest', x: 0, y: 0 }, 'nothing_to_do');
    h.ok({ type: 'buy', itemId: 'hay_bale', x: 5, y: 5 });
    h.fails({ type: 'harvest', x: 5, y: 5 }, 'nothing_to_do');
  });

  it('follow the animalCycle rule', () => {
    const h = setup({ animalCycle: 0.25 });
    h.ok({ type: 'buy', itemId: 'cow', x: 0, y: 0 });
    h.advanceHours(6);
    h.ok({ type: 'harvest', x: 0, y: 0 });
  });
});
