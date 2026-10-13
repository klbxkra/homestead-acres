import { describe, expect, it } from 'vitest';
import { applyCommand, HOUR_MS, plotStatus } from '../../src/core';
import type { Command } from '../../src/core';
import { Harness } from './harness';

describe('plow / plant / harvest loop', () => {
  it('runs the FV1 loop with the right costs, XP and coins', () => {
    const h = new Harness(); // classic: 200 coins
    h.ok({ type: 'plow', x: 3, y: 4 });
    expect(h.player.coins).toBe(185);
    expect(h.player.xp).toBe(1);
    expect(plotStatus(h.plot(3, 4)!, h.gameNow, h.state.rules)).toBe('plowed');

    h.ok({ type: 'plant', x: 3, y: 4, cropId: 'strawberry' });
    expect(h.player.coins).toBe(175);
    expect(h.player.xp).toBe(2);

    h.fails({ type: 'harvest', x: 3, y: 4 }, 'not_ripe');
    h.advanceHours(4);
    const events = h.ok({ type: 'harvest', x: 3, y: 4 });
    expect(h.player.coins).toBe(210);
    expect(h.player.stats.harvested['strawberry']).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'harvested', cropId: 'strawberry', coins: 35 }));

    // FV1: the plot is left fallow and must be plowed again.
    expect(plotStatus(h.plot(3, 4)!, h.gameNow, h.state.rules)).toBe('fallow');
    h.fails({ type: 'plant', x: 3, y: 4, cropId: 'strawberry' }, 'not_plowed');
    h.ok({ type: 'plow', x: 3, y: 4 });
    h.ok({ type: 'plant', x: 3, y: 4, cropId: 'strawberry' });
  });

  it('keepPlowedAfterHarvest lets you replant straight away', () => {
    const h = new Harness({ keepPlowedAfterHarvest: true });
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    h.advanceHours(4);
    h.ok({ type: 'harvest', x: 0, y: 0 });
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
  });

  it('withered crops cannot be harvested but can be plowed over', () => {
    const h = new Harness();
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    h.advanceHours(9);
    h.fails({ type: 'harvest', x: 0, y: 0 }, 'withered');
    const coins = h.player.coins;
    h.ok({ type: 'plow', x: 0, y: 0 });
    expect(h.player.coins).toBe(coins - 15);
    expect(h.plot(0, 0)!.crop).toBeNull();
    expect(Object.keys(h.farm.entities)).toHaveLength(1); // re-used the same plot
  });

  it('rejects plowing a plot that is growing or already plowed', () => {
    const h = new Harness();
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.fails({ type: 'plow', x: 0, y: 0 }, 'already_plowed');
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    h.fails({ type: 'plow', x: 0, y: 0 }, 'occupied');
    h.fails({ type: 'plant', x: 0, y: 0, cropId: 'soybean' }, 'occupied');
  });

  it('rejects actions on empty ground', () => {
    const h = new Harness();
    h.fails({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' }, 'not_plowed');
    h.fails({ type: 'harvest', x: 0, y: 0 }, 'not_plowed');
  });

  it('harvesting an empty plowed plot is rejected', () => {
    const h = new Harness();
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.fails({ type: 'harvest', x: 0, y: 0 }, 'no_crop');
  });
});

describe('validation', () => {
  it('rejects out-of-bounds and non-integer tiles', () => {
    const h = new Harness();
    h.fails({ type: 'plow', x: 12, y: 0 }, 'out_of_bounds');
    h.fails({ type: 'plow', x: -1, y: 0 }, 'out_of_bounds');
    h.fails({ type: 'plow', x: 1.5, y: 0 }, 'invalid');
    h.fails({ type: 'plow', x: Number.NaN, y: 0 }, 'invalid');
  });

  it('rejects unknown commands and unknown or inherited item ids', () => {
    const h = new Harness();
    h.fails({ type: 'teleport' } as unknown as Command, 'invalid');
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.fails({ type: 'plant', x: 0, y: 0, cropId: 'mandrake' }, 'unknown_item');
    h.fails({ type: 'plant', x: 0, y: 0, cropId: 'constructor' }, 'unknown_item');
    h.fails({ type: 'buy', itemId: '__proto__', x: 1, y: 1 }, 'unknown_item');
    h.fails({ type: 'sell', entityId: 'toString' }, 'unknown_entity');
  });

  it('rejects spending more coins than you have, leaving state untouched', () => {
    const h = new Harness({ startingCoins: 20 });
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.fails({ type: 'plow', x: 1, y: 0 }, 'insufficient_coins');
    expect(h.player.coins).toBe(5);
    h.fails({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' }, 'insufficient_coins');
  });

  it('locks crops until their unlock level', () => {
    const h = new Harness({ xpGain: 1000 });
    h.fails({ type: 'plant', x: 0, y: 0, cropId: 'rice' }, 'locked'); // level 10 crop, checked before the plot
    h.ok({ type: 'plow', x: 0, y: 0 });
    expect(h.player.level).toBe(10); // 1000 XP from one plow
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'rice' });
  });

  it('only lets players act on farms they own', () => {
    const h = new Harness();
    h.state.players['intruder'] = { ...h.player, id: 'intruder' };
    const before = h.state;
    const result = applyCommand(
      before,
      { playerId: 'intruder', farmId: h.state.homeFarmId, command: { type: 'plow', x: 0, y: 0 } },
      h.realNow,
      h.content,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_allowed');
    expect(result.state).toBe(before);
  });

  it('rejects unknown players and farms', () => {
    const h = new Harness();
    const cmd: Command = { type: 'plow', x: 0, y: 0 };
    const badPlayer = applyCommand(h.state, { playerId: 'nobody', farmId: h.state.homeFarmId, command: cmd }, h.realNow, h.content);
    const badFarm = applyCommand(h.state, { playerId: h.state.localPlayerId, farmId: 'nowhere', command: cmd }, h.realNow, h.content);
    expect(!badPlayer.ok && badPlayer.error.code).toBe('unknown_player');
    expect(!badFarm.ok && badFarm.error.code).toBe('unknown_farm');
  });
});

describe('decorations: buy / sell / move', () => {
  it('buys and places a decoration for coins and XP', () => {
    const h = new Harness();
    h.ok({ type: 'buy', itemId: 'hay_bale', x: 2, y: 2 });
    expect(h.player.coins).toBe(180);
    expect(h.player.xp).toBe(2);
    h.fails({ type: 'buy', itemId: 'hay_bale', x: 2, y: 2 }, 'occupied');
    h.fails({ type: 'plow', x: 2, y: 2 }, 'occupied');
  });

  it('checks the full footprint, honouring rotation', () => {
    const h = new Harness({ startingCoins: 1000, xpGain: 100 }); // bench needs level 3
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.fails({ type: 'buy', itemId: 'garden_bench', x: 11, y: 0 }, 'out_of_bounds'); // 2 wide
    h.ok({ type: 'buy', itemId: 'garden_bench', x: 11, y: 0, rotated: true }); // 1 wide, 2 tall
  });

  it('sells decorations for half price and plots for nothing', () => {
    const h = new Harness();
    const [placed] = h.ok({ type: 'buy', itemId: 'hay_bale', x: 2, y: 2 });
    const decoId = placed?.type === 'placed' ? placed.entityId : '';
    h.ok({ type: 'sell', entityId: decoId });
    expect(h.player.coins).toBe(190);

    h.ok({ type: 'plow', x: 0, y: 0 });
    const plotId = h.plot(0, 0)!.id;
    h.ok({ type: 'sell', entityId: plotId });
    expect(h.player.coins).toBe(175);
    expect(h.farm.entities).toEqual({});
  });

  it('moves entities to free spots, including overlapping their own old spot', () => {
    const h = new Harness({ startingCoins: 1000, xpGain: 100 });
    h.ok({ type: 'plow', x: 0, y: 0 });
    const [placed] = h.ok({ type: 'buy', itemId: 'garden_bench', x: 5, y: 5 });
    const benchId = placed?.type === 'placed' ? placed.entityId : '';

    h.ok({ type: 'move', entityId: benchId, x: 6, y: 5 }); // overlaps its own old tile
    h.fails({ type: 'move', entityId: benchId, x: 0, y: 0 }, 'occupied');
    h.ok({ type: 'move', entityId: benchId, x: 11, y: 3, rotated: true });
    expect(h.farm.entities[benchId]).toMatchObject({ x: 11, y: 3, rotated: true });

    // Plots move with their crops.
    const plotId = h.plot(0, 0)!.id;
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    h.ok({ type: 'move', entityId: plotId, x: 1, y: 1 });
    expect(h.plot(1, 1)?.crop?.cropId).toBe('strawberry');
    expect(h.plot(0, 0)).toBeUndefined();
  });
});

describe('state handling', () => {
  it('never mutates the input state', () => {
    const h = new Harness();
    const before = h.state;
    const snapshot = structuredClone(before);
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    expect(before).toEqual(snapshot);
  });

  it('emits a levelUp event with its cash reward', () => {
    const h = new Harness({ xpGain: 15 });
    const events = h.ok({ type: 'plow', x: 0, y: 0 });
    expect(events).toContainEqual({ type: 'levelUp', playerId: h.player.id, level: 2, cashReward: 1 });
    expect(h.player.cash).toBe(6);
  });

  it('is deterministic and survives a JSON round trip', () => {
    const script = (h: Harness) => {
      for (let i = 0; i < 6; i++) h.ok({ type: 'plow', x: i, y: 0 });
      for (let i = 0; i < 6; i++) h.ok({ type: 'plant', x: i, y: 0, cropId: i % 2 ? 'soybean' : 'strawberry' });
      h.ok({ type: 'buy', itemId: 'hay_bale', x: 5, y: 5 });
      h.advance(5 * HOUR_MS);
      for (let i = 0; i < 6; i += 2) h.ok({ type: 'harvest', x: i, y: 0 });
      h.advanceHours(30);
      for (let i = 1; i < 6; i += 2) h.ok({ type: 'harvest', x: i, y: 0 });
      return h.state;
    };
    const a = script(new Harness());
    const b = script(new Harness());
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});
