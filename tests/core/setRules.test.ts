import { describe, expect, it } from 'vitest';
import { applyCommand, HOUR_MS, MINUTE_MS, plotStatus, rulesForPreset } from '../../src/core';
import type { WorldRules } from '../../src/core';
import { Harness } from './harness';

const status = (h: Harness, x = 0, y = 0) => plotStatus(h.plot(x, y)!, h.gameNow, h.state.rules);
const withRules = (h: Harness, patch: Partial<WorldRules>) => ({ ...h.state.rules, ...patch, preset: 'custom' as const });

function plantStrawberry(h: Harness, x = 0) {
  h.ok({ type: 'plow', x, y: 0 });
  h.ok({ type: 'plant', x, y: 0, cropId: 'strawberry' });
}

describe('setRules', () => {
  it('replaces the rules and emits rulesChanged', () => {
    const h = new Harness();
    const events = h.ok({ type: 'setRules', rules: rulesForPreset('relaxed') });
    expect(h.state.rules).toEqual(rulesForPreset('relaxed'));
    expect(events).toEqual([{ type: 'rulesChanged', refreshed: 0 }]);
  });

  it('rejects invalid rules without changing anything', () => {
    const h = new Harness();
    h.fails({ type: 'setRules', rules: { ...h.state.rules, timeScale: -1 } }, 'invalid');
    h.fails({ type: 'setRules', rules: 'fast please' }, 'invalid');
  });

  it('only lets the farm owner change rules', () => {
    const h = new Harness();
    h.state.players['guest'] = { ...h.player, id: 'guest' };
    const result = applyCommand(h.state, { playerId: 'guest', farmId: h.state.homeFarmId, command: { type: 'setRules', rules: rulesForPreset('speedrun') } }, h.realNow, h.content);
    expect(!result.ok && result.error.code).toBe('not_allowed');
  });

  it('a new grow-time multiplier only affects crops planted afterwards', () => {
    const h = new Harness();
    plantStrawberry(h, 0);
    h.ok({ type: 'setRules', rules: withRules(h, { cropGrowth: 0.5 }) });
    plantStrawberry(h, 1);
    h.advanceHours(2);
    expect(status(h, 1)).toBe('ripe');
    expect(status(h, 0)).toBe('growing');
    h.advanceHours(2);
    expect(status(h, 0)).toBe('ripe');
  });

  it('turning withering on gives long-ripe crops a fresh window instead of withering them on the spot', () => {
    const h = new Harness({ witherEnabled: false });
    plantStrawberry(h, 0); // ripe at 4h
    h.advanceHours(30); // ripe for 26h
    expect(status(h)).toBe('ripe');

    const events = h.ok({ type: 'setRules', rules: withRules(h, { witherEnabled: true }) });
    expect(events).toEqual([{ type: 'rulesChanged', refreshed: 1 }]);
    expect(status(h)).toBe('ripe');
    h.advanceHours(3.9);
    expect(status(h)).toBe('ripe');
    h.advanceHours(0.2); // a full 4h window (1x grow time) after the change
    expect(status(h)).toBe('withered');
  });

  it('shrinking the harvest window does not wither ripe crops instantly either', () => {
    const h = new Harness({ witherWindowFactor: 3 });
    plantStrawberry(h, 0);
    h.advanceHours(10); // ripe for 6h of a 12h window
    h.ok({ type: 'setRules', rules: withRules(h, { witherWindowFactor: 1 }) });
    expect(status(h)).toBe('ripe');
    h.advanceHours(4.1);
    expect(status(h)).toBe('withered');
  });

  it('leaves growing crops and crops that already withered alone', () => {
    const h = new Harness();
    plantStrawberry(h, 0);
    h.advanceHours(9); // withered
    plantStrawberry(h, 1); // growing
    const events = h.ok({ type: 'setRules', rules: withRules(h, { witherWindowFactor: 0.5 }) });
    expect(events).toEqual([{ type: 'rulesChanged', refreshed: 0 }]);
    expect(status(h, 0)).toBe('withered');
    expect(status(h, 1)).toBe('growing');
  });

  it('turning withering off revives withered crops (they become harvestable)', () => {
    const h = new Harness();
    plantStrawberry(h, 0);
    h.advanceHours(9);
    h.ok({ type: 'setRules', rules: withRules(h, { witherEnabled: false }) });
    h.ok({ type: 'harvest', x: 0, y: 0 });
  });

  it('a timeScale change only applies from the moment it is made', () => {
    const h = new Harness();
    h.advance(10 * MINUTE_MS); // 10 game minutes at x1
    const before = h.gameNow;
    h.ok({ type: 'setRules', rules: withRules(h, { timeScale: 60 }) });
    expect(h.gameNow).toBe(before); // nothing retroactive
    h.advance(MINUTE_MS);
    expect(h.gameNow - before).toBe(HOUR_MS);
  });
});
