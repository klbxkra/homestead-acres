import { describe, expect, it } from 'vitest';
import { fuelAt, refuelCost } from '../../src/core';
import { Harness } from './harness';

function withVehicle(vehicleId: string, rules = {}) {
  const h = new Harness({ collectibleDropRate: 0, ...rules });
  h.cheat({ level: 40, coins: 1_000_000 });
  h.ok({ type: 'buyVehicle', vehicleId });
  return h;
}

const fuel = (h: Harness) => fuelAt(h.player.fuel, h.gameNow, h.state.rules, h.content);

describe('buying vehicles', () => {
  it('is level-gated and one of each', () => {
    const h = new Harness({ startingCoins: 100_000 });
    h.fails({ type: 'buyVehicle', vehicleId: 'tractor' }, 'locked');
    h.cheat({ level: 10 });
    h.ok({ type: 'buyVehicle', vehicleId: 'tractor' });
    expect(h.player.coins).toBe(92_000);
    h.fails({ type: 'buyVehicle', vehicleId: 'tractor' }, 'already_owned');
    h.fails({ type: 'useVehicle', vehicleId: 'harvester', x: 0, y: 0 }, 'not_owned');
  });
});

describe('using vehicles', () => {
  it('a tractor plows a 2x2 block for one fuel', () => {
    const h = withVehicle('tractor');
    const events = h.ok({ type: 'useVehicle', vehicleId: 'tractor', x: 3, y: 3 });
    expect(['3,3', '4,3', '3,4', '4,4'].every((k) => h.plot(Number(k[0]), Number(k[2]))?.plowed)).toBe(true);
    expect(events.filter((e) => e.type === 'plowed')).toHaveLength(4);
    expect(events).toContainEqual({ type: 'vehicleUsed', vehicleId: 'tractor', tiles: 4, fuel: 1 });
    expect(fuel(h)).toBe(9);
  });

  it('skips tiles it cannot work, and refuses (without using fuel) when nothing could be done', () => {
    const h = withVehicle('tractor');
    h.ok({ type: 'buy', itemId: 'hay_bale', x: 0, y: 0 });
    h.ok({ type: 'useVehicle', vehicleId: 'tractor', x: 0, y: 0 }); // 3 of 4 tiles
    expect(h.lastEvents.find((e) => e.type === 'vehicleUsed')).toMatchObject({ tiles: 3 });
    h.fails({ type: 'useVehicle', vehicleId: 'tractor', x: 0, y: 0 }, 'nothing_to_do'); // all plowed or blocked
    expect(fuel(h)).toBe(9);
    h.ok({ type: 'useVehicle', vehicleId: 'tractor', x: 11, y: 11 }); // corner: only 1 tile is on the farm
  });

  it('a combine harvests, plows and plants a 3x3 block in one pass', () => {
    const h = withVehicle('combine');
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      h.ok({ type: 'plow', x, y });
      h.ok({ type: 'plant', x, y, cropId: 'strawberry' });
    }
    h.advanceHours(4);
    const coins = h.player.coins;
    h.ok({ type: 'useVehicle', vehicleId: 'combine', x: 0, y: 0, cropId: 'raspberry' });
    expect(h.player.stats.harvested['strawberry']).toBe(9);
    expect(h.plot(2, 2)?.crop?.cropId).toBe('raspberry');
    expect(h.player.coins).toBe(coins + 9 * (35 - 15 - 20)); // harvest - plow - raspberry seeds
    expect(fuel(h)).toBe(8); // combines use 2
  });

  it('a seeder needs seeds chosen', () => {
    const h = withVehicle('seeder');
    h.fails({ type: 'useVehicle', vehicleId: 'seeder', x: 0, y: 0 }, 'invalid');
  });

  it('keeps the tiles already done when coins run out part-way', () => {
    const h = withVehicle('tractor');
    h.cheat({ coins: 31 }); // two plows
    h.ok({ type: 'useVehicle', vehicleId: 'tractor', x: 0, y: 0 });
    expect(h.lastEvents.filter((e) => e.type === 'plowed')).toHaveLength(2);
    h.fails({ type: 'useVehicle', vehicleId: 'tractor', x: 5, y: 5 }, 'insufficient_coins');
  });
});

describe('fuel', () => {
  it('runs out, regenerates over game hours and can be refilled with Farm Cash', () => {
    const h = withVehicle('tractor', { fuelRegenPerHour: 2 });
    for (let i = 0; i < 10; i++) h.ok({ type: 'useVehicle', vehicleId: 'tractor', x: (i % 6) * 2, y: Math.floor(i / 6) * 2 });
    h.fails({ type: 'useVehicle', vehicleId: 'tractor', x: 0, y: 8 }, 'no_fuel');
    h.advanceHours(0.5);
    expect(fuel(h)).toBeCloseTo(1);
    h.ok({ type: 'useVehicle', vehicleId: 'tractor', x: 0, y: 8 });
    expect(refuelCost(h.player.fuel, h.gameNow, h.state.rules, h.content)).toBe(2); // 10 missing / 5 per cash
    h.cheat({ cash: 1 });
    h.fails({ type: 'refuel' }, 'insufficient_cash');
    h.cheat({ cash: 5 });
    h.ok({ type: 'refuel' });
    expect(fuel(h)).toBe(10);
    expect(h.player.cash).toBe(3);
    h.fails({ type: 'refuel' }, 'nothing_to_do');
    h.advanceHours(100);
    expect(fuel(h)).toBe(10); // never above the tank size
  });
});
