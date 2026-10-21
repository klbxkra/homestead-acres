import { describe, expect, it } from 'vitest';
import { isNoteworthy, summarizeAway } from '../../src/app/awaySummary';
import { HOUR_MS, tick } from '../../src/core';
import { Harness } from '../core/harness';

describe('summarizeAway', () => {
  it('counts crops that ripened or withered while away', () => {
    const h = new Harness();
    h.ok({ type: 'plow', x: 0, y: 0 });
    h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' }); // 4h, withers at 8h
    h.ok({ type: 'plow', x: 1, y: 0 });
    h.ok({ type: 'plant', x: 1, y: 0, cropId: 'soybean' }); // 24h, withers at 48h
    h.ok({ type: 'plow', x: 2, y: 0 });
    h.ok({ type: 'plant', x: 2, y: 0, cropId: 'strawberry' });
    const before = h.state;

    const afterFive = tick(before, h.realNow + 5 * HOUR_MS, h.content);
    const s1 = summarizeAway(before, afterFive, h.realNow + 5 * HOUR_MS, h.content);
    expect(s1).toMatchObject({ ripened: 2, withered: 0, ripenedByCrop: { Strawberries: 2 }, awayMs: 5 * HOUR_MS, farmName: 'Test Farm' });
    expect(isNoteworthy(s1)).toBe(true);

    const afterDay = tick(before, h.realNow + 25 * HOUR_MS, h.content);
    const s2 = summarizeAway(before, afterDay, h.realNow + 25 * HOUR_MS, h.content);
    expect(s2).toMatchObject({ ripened: 1, withered: 2, ripenedByCrop: { Soybeans: 1 } });
  });

  it('is not noteworthy for a short break with no changes', () => {
    const h = new Harness();
    const later = tick(h.state, h.realNow + 30_000, h.content);
    expect(isNoteworthy(summarizeAway(h.state, later, h.realNow + 30_000, h.content))).toBe(false);
  });
});
