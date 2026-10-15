import { describe, expect, it } from 'vitest';
import { HOUR_MS } from '../../src/core';
import { resolvePaint, resolveTap } from '../../src/game/tools/toolActions';
import type { ToolContext } from '../../src/game/tools/toolActions';
import { Harness } from '../core/harness';

const ctx = (patch: Partial<ToolContext> = {}): ToolContext => ({
  tool: 'multi',
  seedId: null,
  placeItemId: null,
  placeFrom: 'market',
  movingEntityId: null,
  vehicleId: null,
  rotated: false,
  ...patch,
});

function tap(h: Harness, c: ToolContext, x: number, y: number) {
  return resolveTap(c, h.farm, { x, y }, h.gameNow, h.state.rules, h.content);
}

describe('multi-tool', () => {
  it('plows grass, asks for seeds on a plowed plot, then plants the chosen seed', () => {
    const h = new Harness();
    expect(tap(h, ctx(), 0, 0)).toEqual({ kind: 'command', command: { type: 'plow', x: 0, y: 0 } });
    h.ok({ type: 'plow', x: 0, y: 0 });
    expect(tap(h, ctx(), 0, 0)).toEqual({ kind: 'openMarket', tab: 'seeds' });
    expect(tap(h, ctx({ seedId: 'strawberry' }), 0, 0)).toEqual({
      kind: 'command',
      command: { type: 'plant', x: 0, y: 0, cropId: 'strawberry' },
    });
  });

  it('inspects growing crops, harvests ripe ones and plows over withered ones', () => {
    const h = new Harness();
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    expect(tap(h, ctx(), 0, 0)).toEqual({ kind: 'inspect' });
    h.advanceHours(4);
    expect(tap(h, ctx(), 0, 0)).toMatchObject({ command: { type: 'harvest' } });
    h.advanceHours(4);
    expect(tap(h, ctx(), 0, 0)).toMatchObject({ command: { type: 'plow' } });
  });

  it('plows fallow plots after a harvest', () => {
    const h = new Harness();
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    h.advance(4 * HOUR_MS, { asOneGap: true });
    h.ok({ type: 'harvest', x: 0, y: 0 });
    expect(tap(h, ctx({ seedId: 'strawberry' }), 0, 0)).toMatchObject({ command: { type: 'plow' } });
  });

  it('inspects decorations and ignores taps off the farm', () => {
    const h = new Harness();
    h.ok({ type: 'buy', itemId: 'hay_bale', x: 1, y: 1 });
    expect(tap(h, ctx(), 1, 1)).toEqual({ kind: 'inspect' });
    expect(tap(h, ctx(), -1, 0)).toEqual({ kind: 'none' });
    expect(tap(h, ctx(), 12, 3)).toEqual({ kind: 'none' });
  });
});

describe('other tools', () => {
  it('seed tool without a seed opens the market', () => {
    const h = new Harness();
    expect(tap(h, ctx({ tool: 'seed' }), 0, 0)).toEqual({ kind: 'openMarket', tab: 'seeds' });
  });

  it('move tool picks up, then moves with the current rotation', () => {
    const h = new Harness();
    const [placed] = h.ok({ type: 'buy', itemId: 'hay_bale', x: 1, y: 1 });
    const id = placed?.type === 'placed' ? placed.entityId : '';
    expect(tap(h, ctx({ tool: 'move' }), 1, 1)).toEqual({ kind: 'pick', entityId: id });
    expect(tap(h, ctx({ tool: 'move' }), 5, 5)).toEqual({ kind: 'none' });
    expect(tap(h, ctx({ tool: 'move', movingEntityId: id, rotated: true }), 4, 4)).toEqual({
      kind: 'command',
      command: { type: 'move', entityId: id, x: 4, y: 4, rotated: true },
    });
  });

  it('sell asks for confirmation for decorations and live crops, not for empty plots', () => {
    const h = new Harness();
    h.ok({ type: 'buy', itemId: 'hay_bale', x: 1, y: 1 });
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.ok({ type: 'plow', x: 2, y: 2 });
    h.ok({ type: 'plant', x: 2, y: 2, cropId: 'strawberry' });
    const sell = ctx({ tool: 'sell' });
    expect(tap(h, sell, 1, 1)).toMatchObject({ kind: 'command', confirm: 'Sell Hay Bale for 10 coins?' });
    expect(tap(h, sell, 2, 2)).toMatchObject({ kind: 'command', confirm: expect.stringContaining('Strawberries') });
    const plain = tap(h, sell, 0, 0);
    expect(plain.kind === 'command' && plain.confirm).toBeFalsy();
    expect(tap(h, sell, 5, 5)).toEqual({ kind: 'none' });
  });

  it('place tool buys the held item at the tapped tile', () => {
    const h = new Harness();
    expect(tap(h, ctx({ tool: 'place', placeItemId: 'white_fence', rotated: true }), 3, 4)).toEqual({
      kind: 'command',
      command: { type: 'buy', itemId: 'white_fence', x: 3, y: 4, rotated: true },
    });
  });
});

describe('resolvePaint', () => {
  it('only returns plain commands', () => {
    const h = new Harness();
    expect(resolvePaint(ctx(), h.farm, { x: 0, y: 0 }, h.gameNow, h.state.rules, h.content)).toEqual({ type: 'plow', x: 0, y: 0 });
    h.ok({ type: 'plow', x: 0, y: 0 });
    // No seed chosen: the multi-tool would open the market, which painting must not do.
    expect(resolvePaint(ctx(), h.farm, { x: 0, y: 0 }, h.gameNow, h.state.rules, h.content)).toBeNull();
    // Selling a planted plot needs confirmation, so painting skips it.
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    expect(resolvePaint(ctx({ tool: 'sell' }), h.farm, { x: 0, y: 0 }, h.gameNow, h.state.rules, h.content)).toBeNull();
  });
});
