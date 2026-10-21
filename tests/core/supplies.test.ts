import { describe, expect, it } from 'vitest';
import { cropStatus, fuelAt, fuelCapacity, storageCapacity } from '../../src/core';
import type { WorldRules } from '../../src/core';
import { Harness } from './harness';

function setup(rules: Partial<WorldRules> = {}) {
  const h = new Harness(rules);
  h.cheat({ level: 30, coins: 1_000_000, cash: 100 });
  return h;
}

function plant(h: Harness, x: number, y: number, cropId = 'soybean') {
  h.ok({ type: 'plow', x, y });
  h.ok({ type: 'plant', x, y, cropId });
}

describe('supplies', () => {
  it('are bought into the gift box for coins or Farm Cash', () => {
    const h = setup();
    h.ok({ type: 'buySupply', itemId: 'fertilizer', count: 3 });
    expect(h.player.giftBox['fertilizer']).toBe(3);
    expect(h.player.coins).toBe(1_000_000 - 450);
    h.ok({ type: 'buySupply', itemId: 'instagrow' });
    expect(h.player.cash).toBe(98);
    h.fails({ type: 'buySupply', itemId: 'fertilizer', count: 0 }, 'invalid');
    h.fails({ type: 'buySupply', itemId: 'gold_bar' }, 'unknown_item');
    h.cheat({ cash: 1 });
    h.fails({ type: 'buySupply', itemId: 'instagrow' }, 'insufficient_cash');
  });

  it('respect unlock levels and buyCost (coins only)', () => {
    const h = new Harness({ buyCost: 2 });
    h.cheat({ coins: 10_000, cash: 10 });
    h.fails({ type: 'buySupply', itemId: 'fuel_can' }, 'locked');
    h.ok({ type: 'buySupply', itemId: 'nail' });
    expect(h.player.coins).toBe(10_000 - 300);
  });

  it('fertilizer marks growing crops in a 3x3 area', () => {
    const h = setup();
    plant(h, 0, 0);
    plant(h, 2, 2);
    plant(h, 3, 3); // outside the square
    h.ok({ type: 'buySupply', itemId: 'fertilizer' });
    h.ok({ type: 'useSupply', itemId: 'fertilizer', x: 0, y: 0 });
    expect(h.lastEvents).toContainEqual(expect.objectContaining({ type: 'supplyUsed', affected: 2 }));
    expect(h.plot(0, 0)!.crop!.fertilized).toBe(true);
    expect(h.plot(3, 3)!.crop!.fertilized).toBeUndefined();
    expect(h.player.giftBox['fertilizer']).toBeUndefined();
    h.ok({ type: 'buySupply', itemId: 'fertilizer' });
    h.fails({ type: 'useSupply', itemId: 'fertilizer', x: 0, y: 0 }, 'nothing_to_do'); // already fertilized
    expect(h.player.giftBox['fertilizer']).toBe(1); // not used up
  });

  it('Instagrow ripens growing crops in its area', () => {
    const h = setup();
    plant(h, 5, 5, 'watermelon'); // 4 days
    h.ok({ type: 'buySupply', itemId: 'instagrow' });
    h.ok({ type: 'useSupply', itemId: 'instagrow', x: 4, y: 4 });
    expect(cropStatus(h.plot(5, 5)!.crop!, h.gameNow, h.state.rules)).toBe('ripe');
    h.ok({ type: 'harvest', x: 5, y: 5 });
  });

  it('Unwither Tonic revives every withered crop with a full ripe window', () => {
    const h = setup();
    plant(h, 0, 0, 'strawberry'); // 4h, withers 4h after ripening
    plant(h, 9, 9, 'strawberry');
    h.advanceHours(9);
    expect(cropStatus(h.plot(0, 0)!.crop!, h.gameNow, h.state.rules)).toBe('withered');
    h.ok({ type: 'buySupply', itemId: 'unwither_tonic' });
    h.ok({ type: 'useSupply', itemId: 'unwither_tonic' });
    expect(h.lastEvents).toContainEqual(expect.objectContaining({ type: 'supplyUsed', affected: 2 }));
    h.advanceHours(3.9);
    h.ok({ type: 'harvest', x: 9, y: 9 });
    h.ok({ type: 'buySupply', itemId: 'unwither_tonic' });
    h.fails({ type: 'useSupply', itemId: 'unwither_tonic' }, 'nothing_to_do');
  });

  it('Fuel Cans top up the tank, but not past full', () => {
    const h = setup();
    h.ok({ type: 'buyVehicle', vehicleId: 'tractor' });
    for (let i = 0; i < 8; i++) h.ok({ type: 'useVehicle', vehicleId: 'tractor', x: (i % 4) * 3, y: Math.floor(i / 4) * 3 });
    h.ok({ type: 'buySupply', itemId: 'fuel_can', count: 2 });
    h.ok({ type: 'useSupply', itemId: 'fuel_can' });
    expect(fuelAt(h.player.fuel, h.gameNow, h.state.rules, h.content)).toBeCloseTo(7, 1);
    h.ok({ type: 'useSupply', itemId: 'fuel_can' });
    expect(fuelAt(h.player.fuel, h.gameNow, h.state.rules, h.content)).toBe(10);
    h.ok({ type: 'buySupply', itemId: 'fuel_can' });
    h.fails({ type: 'useSupply', itemId: 'fuel_can' }, 'nothing_to_do');
  });

  it('parts are not used on their own, and nothing is used without having it', () => {
    const h = setup();
    h.ok({ type: 'buySupply', itemId: 'brick' });
    h.fails({ type: 'useSupply', itemId: 'brick' }, 'invalid');
    h.fails({ type: 'useSupply', itemId: 'fertilizer', x: 0, y: 0 }, 'not_in_inventory');
  });
});

describe('construction buildings', () => {
  it('start as a frame, take parts from the gift box, and work once finished', () => {
    const h = setup();
    h.ok({ type: 'buy', itemId: 'orchard', x: 0, y: 0 }); // 10 boards, 10 nails, 5 bricks
    const orchard = h.entityAt(0, 0)!;
    expect(orchard).toMatchObject({ kind: 'building', parts: {} });
    h.fails({ type: 'addParts', entityId: orchard.id }, 'not_in_inventory');

    // Trees can't move in yet: the frame is just in the way.
    h.fails({ type: 'buy', itemId: 'apple_tree', x: 1, y: 1 }, 'occupied');
    h.fails({ type: 'harvest', x: 1, y: 1 }, 'nothing_to_do');
    h.fails({ type: 'store', entityId: orchard.id }, 'not_empty');

    h.ok({ type: 'buySupply', itemId: 'wooden_board', count: 10 });
    h.ok({ type: 'buySupply', itemId: 'nail', count: 4 });
    h.ok({ type: 'addParts', entityId: orchard.id });
    expect(h.lastEvents).toContainEqual({ type: 'partsAdded', entityId: orchard.id, added: 14, missing: 11 });
    expect(h.player.giftBox['wooden_board']).toBeUndefined();

    h.ok({ type: 'buySupply', itemId: 'nail', count: 8 }); // two more than needed
    h.ok({ type: 'buySupply', itemId: 'brick', count: 4 });
    h.ok({ type: 'addParts', entityId: orchard.id });
    expect(h.lastEvents).toContainEqual({ type: 'partsAdded', entityId: orchard.id, added: 10, missing: 1 });
    expect(h.entityAt(0, 0)).toHaveProperty('parts'); // one brick short: still a frame
    h.ok({ type: 'buySupply', itemId: 'brick' });
    h.ok({ type: 'addParts', entityId: orchard.id });
    expect(h.lastEvents).toContainEqual({ type: 'constructionCompleted', entityId: orchard.id, itemId: 'orchard' });
    expect(h.player.giftBox['nail']).toBe(2);
    expect(h.entityAt(0, 0)).not.toHaveProperty('parts');
    expect(h.player.stats.counters['buildingsBuilt']).toBe(1);
    h.fails({ type: 'addParts', entityId: orchard.id }, 'nothing_to_do');

    // Now trees live inside and are collected together.
    h.ok({ type: 'buy', itemId: 'apple_tree', x: 1, y: 1 });
    h.ok({ type: 'buy', itemId: 'cherry_tree', x: 1, y: 1 });
    h.advanceHours(72);
    const coins = h.player.coins;
    h.ok({ type: 'harvest', x: 2, y: 2 });
    expect(h.lastEvents).toContainEqual(expect.objectContaining({ type: 'collected', count: 2, coins: 75 + 65 }));
    expect(h.player.coins).toBe(coins + 140);
    expect(h.player.stats.counters['treesHarvested']).toBe(2);
  });

  it('move a planted tree into a finished orchard', () => {
    const h = setup();
    h.ok({ type: 'buy', itemId: 'pear_tree', x: 8, y: 8 });
    h.state.players[h.state.localPlayerId]!.giftBox['orchard'] = 1; // a reward copy is already built
    h.ok({ type: 'place', itemId: 'orchard', from: 'giftBox', x: 0, y: 0 });
    expect(h.entityAt(0, 0)).not.toHaveProperty('parts');
    h.ok({ type: 'move', entityId: h.entityAt(8, 8)!.id, x: 0, y: 0 });
    expect(h.entityAt(8, 8)).toBeUndefined();
    const orchard = h.entityAt(0, 0)!;
    expect(orchard.kind === 'building' && orchard.housed.map((a) => a.itemId)).toEqual(['pear_tree']);
  });

  it('a finished garage makes the fuel tank bigger', () => {
    const h = setup();
    expect(fuelCapacity(h.farm, h.content)).toBe(10);
    h.ok({ type: 'buy', itemId: 'garage', x: 0, y: 0 });
    expect(fuelCapacity(h.farm, h.content)).toBe(10); // still a frame
    for (const part of ['wooden_board', 'nail', 'shingle']) h.ok({ type: 'buySupply', itemId: part, count: 6 });
    h.ok({ type: 'addParts', entityId: h.entityAt(0, 0)!.id });
    expect(fuelCapacity(h.farm, h.content)).toBe(20);
    h.ok({ type: 'refuel' });
    expect(fuelAt(h.player.fuel, h.gameNow, h.state.rules, h.content, 20)).toBe(20);
  });

  it('storage buildings only add space once built (non-construction ones are built at once)', () => {
    const h = setup();
    h.ok({ type: 'buy', itemId: 'barn', x: 0, y: 0 });
    expect(storageCapacity(h.farm, h.content)).toBe(130);
  });
});

describe('animal babies', () => {
  it('sometimes arrive in the gift box when collecting from animals in buildings', () => {
    const h = setup({ collectibleDropRate: 100 }); // 2% x 100: every time
    h.ok({ type: 'buy', itemId: 'chicken_coop', x: 0, y: 0 });
    h.ok({ type: 'buy', itemId: 'chicken', x: 0, y: 0 });
    h.ok({ type: 'buy', itemId: 'chicken', x: 0, y: 0 });
    h.advanceHours(24);
    h.ok({ type: 'harvest', x: 0, y: 0 });
    expect(h.player.giftBox['chicken']).toBe(2);
    expect(h.lastEvents.filter((e) => e.type === 'itemReceived' && e.reason === 'baby')).toHaveLength(2);
  });

  it('are rare at normal rates', () => {
    const h = setup();
    h.ok({ type: 'buy', itemId: 'chicken_coop', x: 0, y: 0 });
    for (let i = 0; i < 20; i++) h.ok({ type: 'buy', itemId: 'chicken', x: 0, y: 0 });
    let babies = 0;
    for (let day = 0; day < 10; day++) {
      h.advanceHours(24);
      h.ok({ type: 'harvest', x: 0, y: 0 });
      babies += h.lastEvents.filter((e) => e.type === 'itemReceived' && e.reason === 'baby').length;
    }
    expect(babies).toBeLessThan(15); // about 4 expected from 200 collections at 2%
  });
});
