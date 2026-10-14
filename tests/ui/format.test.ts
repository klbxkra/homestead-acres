import { describe, expect, it } from 'vitest';
import { HOUR_MS, MINUTE_MS } from '../../src/core';
import { describeTile, formatDuration } from '../../src/ui/format';
import { Harness } from '../core/harness';

describe('formatDuration', () => {
  it('formats each range compactly', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(1)).toBe('1s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(144_000)).toBe('2m 24s');
    expect(formatDuration(3 * MINUTE_MS)).toBe('3m');
    expect(formatDuration(42 * MINUTE_MS)).toBe('42m');
    expect(formatDuration(2 * HOUR_MS + 13 * MINUTE_MS)).toBe('2h 13m');
    expect(formatDuration(4 * HOUR_MS)).toBe('4h');
    expect(formatDuration(76 * HOUR_MS)).toBe('3d 4h');
    expect(formatDuration(-5)).toBe('0s');
  });
});

describe('describeTile', () => {
  it('describes each stage of a plot, with waits in real time', () => {
    const h = new Harness({ timeScale: 60 });
    const d = () => describeTile(h.farm, 0, 0, h.gameNow, h.state.rules, h.content);
    expect(d()).toEqual({ title: 'Grass', lines: ['Plow for 15 coins'] });
    h.ok({ type: 'plow', x: 0, y: 0 });
    expect(d()?.title).toBe('Plowed plot');
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    expect(d()).toEqual({ title: 'Strawberries', lines: ['Ready in 4m'] }); // 4 game hours at x60
    h.advance(4 * MINUTE_MS);
    expect(d()).toEqual({ title: 'Strawberries: ripe!', lines: ['Harvest for 35 coins', 'Withers in 4m'] });
    h.advance(4 * MINUTE_MS);
    expect(d()?.title).toBe('Strawberries (withered)');
  });

  it('says when a crop never withers, and describes decorations', () => {
    const h = new Harness({ witherEnabled: false });
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    h.advanceHours(5);
    expect(describeTile(h.farm, 0, 0, h.gameNow, h.state.rules, h.content)?.lines).toContain('Never withers');
    h.ok({ type: 'buy', itemId: 'hay_bale', x: 3, y: 3 });
    expect(describeTile(h.farm, 3, 3, h.gameNow, h.state.rules, h.content)).toEqual({ title: 'Hay Bale', lines: ['Sells for 10 coins'] });
    expect(describeTile(h.farm, 20, 0, h.gameNow, h.state.rules, h.content)).toBeNull();
  });
});
