import { describe, expect, it } from 'vitest';
import { storageCapacity, storedCount } from '../../src/core';
import { Harness } from './harness';

const rich = () => {
  const h = new Harness();
  h.cheat({ level: 40, coins: 1_000_000 });
  return h;
};

describe('buying placeables', () => {
  it('buys trees, animals and buildings with their footprints', () => {
    const h = rich();
    h.ok({ type: 'buy', itemId: 'apple_tree', x: 0, y: 0 });
    h.ok({ type: 'buy', itemId: 'cow', x: 1, y: 0 });
    h.ok({ type: 'buy', itemId: 'barn', x: 5, y: 5 });
    expect(h.entityAt(0, 0)?.kind).toBe('tree');
    expect(h.entityAt(1, 0)?.kind).toBe('animal');
    expect(h.entityAt(7, 7)?.kind).toBe('building'); // 3x3 footprint
    h.fails({ type: 'buy', itemId: 'hay_bale', x: 6, y: 6 }, 'occupied');
    h.fails({ type: 'buy', itemId: 'barn', x: 10, y: 10 }, 'out_of_bounds');
  });

  it('respects unlock levels and refuses reward-only items', () => {
    const h = new Harness({ startingCoins: 100_000 });
    h.fails({ type: 'buy', itemId: 'barn', x: 0, y: 0 }, 'locked');
    h.fails({ type: 'buy', itemId: 'mastery_sign', x: 0, y: 0 }, 'unknown_item');
  });

  it('counts purchases towards the Decorator ribbon', () => {
    const h = rich();
    for (let i = 0; i < 5; i++) h.ok({ type: 'buy', itemId: 'white_fence', x: i, y: 0 });
    expect(h.player.ribbons['decorator']).toBe(1);
  });
});

describe('housing animals', () => {
  it('moves an animal in when it is bought onto a matching building', () => {
    const h = rich();
    h.ok({ type: 'buy', itemId: 'chicken_coop', x: 0, y: 0 });
    const events = h.ok({ type: 'buy', itemId: 'chicken', x: 1, y: 1 });
    expect(events.some((e) => e.type === 'animalHoused')).toBe(true);
    const coop = h.entityAt(0, 0);
    expect(coop?.kind === 'building' && coop.housed.map((a) => a.itemId)).toEqual(['chicken']);
  });

  it('moves an animal in when it is dragged onto a matching building, keeping its timer', () => {
    const h = rich();
    h.ok({ type: 'buy', itemId: 'chicken_coop', x: 0, y: 0 });
    h.ok({ type: 'buy', itemId: 'chicken', x: 5, y: 5 });
    const chicken = h.entityAt(5, 5)!;
    const readyAt = chicken.kind === 'animal' ? chicken.readyAt : 0;
    h.ok({ type: 'move', entityId: chicken.id, x: 0, y: 1 });
    expect(h.entityAt(5, 5)).toBeUndefined();
    const coop = h.entityAt(0, 0);
    expect(coop?.kind === 'building' && coop.housed[0]?.readyAt).toBe(readyAt);
  });

  it('refuses animals a building does not take, and full buildings', () => {
    const h = rich();
    h.ok({ type: 'buy', itemId: 'chicken_coop', x: 0, y: 0 });
    h.fails({ type: 'buy', itemId: 'cow', x: 0, y: 0 }, 'occupied'); // cows don't live in coops
    const coop = h.entityAt(0, 0)!;
    if (coop.kind === 'building') coop.housed = Array.from({ length: 20 }, () => ({ itemId: 'chicken', readyAt: 0 }));
    h.fails({ type: 'buy', itemId: 'chicken', x: 0, y: 0 }, 'building_full');
  });

  it('will not sell or store a building with animals inside', () => {
    const h = rich();
    h.ok({ type: 'buy', itemId: 'chicken_coop', x: 0, y: 0 });
    h.ok({ type: 'buy', itemId: 'chicken', x: 0, y: 0 });
    const coop = h.entityAt(0, 0)!;
    h.fails({ type: 'sell', entityId: coop.id }, 'not_empty');
    h.fails({ type: 'store', entityId: coop.id }, 'not_empty');
    h.ok({ type: 'move', entityId: coop.id, x: 6, y: 6 }); // but it can be moved, animals and all
  });
});

describe('storage and gift box', () => {
  it('stores items and places them back without paying or earning XP again', () => {
    const h = rich();
    h.ok({ type: 'buy', itemId: 'scarecrow', x: 2, y: 2 });
    const id = h.entityAt(2, 2)!.id;
    h.ok({ type: 'store', entityId: id });
    expect(h.player.storage).toEqual({ scarecrow: 1 });
    expect(h.entityAt(2, 2)).toBeUndefined();

    const coins = h.player.coins;
    const xp = h.player.xp;
    h.ok({ type: 'place', itemId: 'scarecrow', from: 'storage', x: 4, y: 4 });
    expect(h.player.storage).toEqual({});
    expect(h.player.coins).toBe(coins);
    expect(h.player.xp).toBe(xp);
    h.fails({ type: 'place', itemId: 'scarecrow', from: 'storage', x: 5, y: 5 }, 'not_in_inventory');
  });

  it('cannot store plots', () => {
    const h = rich();
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.fails({ type: 'store', entityId: h.plot(0, 0)!.id }, 'invalid');
  });

  it('limits storage, and storage buildings add room', () => {
    const h = rich();
    expect(storageCapacity(h.farm, h.content)).toBe(30);
    h.state.players[h.state.localPlayerId]!.storage = { hay_bale: 30 };
    h.ok({ type: 'buy', itemId: 'white_fence', x: 0, y: 0 });
    h.fails({ type: 'store', entityId: h.entityAt(0, 0)!.id }, 'storage_full');
    h.ok({ type: 'buy', itemId: 'storage_cellar', x: 5, y: 5 });
    expect(storageCapacity(h.farm, h.content)).toBe(70);
    h.ok({ type: 'store', entityId: h.entityAt(0, 0)!.id });
    expect(storedCount(h.player)).toBe(31);
    // Removing the cellar now would overflow storage.
    h.fails({ type: 'sell', entityId: h.entityAt(5, 5)!.id }, 'storage_full');
    h.fails({ type: 'store', entityId: h.entityAt(5, 5)!.id }, 'storage_full');
  });

  it('sells inventory items for half price, reward items for nothing', () => {
    const h = rich();
    const p = h.state.players[h.state.localPlayerId]!;
    p.storage = { fountain: 1 };
    p.giftBox = { mastery_sign: 2 };
    const coins = p.coins;
    h.ok({ type: 'sellItem', itemId: 'fountain', from: 'storage' });
    expect(h.player.coins).toBe(coins + 750);
    h.ok({ type: 'sellItem', itemId: 'mastery_sign', from: 'giftBox' });
    expect(h.player.coins).toBe(coins + 750);
    expect(h.player.giftBox).toEqual({ mastery_sign: 1 });
    h.fails({ type: 'sellItem', itemId: 'fountain', from: 'storage' }, 'not_in_inventory');
    h.fails({ type: 'sellItem', itemId: 'fountain', from: 'attic' as 'storage' }, 'invalid');
  });
});
