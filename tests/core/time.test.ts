import { describe, expect, it } from 'vitest';
import { advanceClock, creditedRealMs, HOUR_MS, MINUTE_MS, OFFLINE_GAP_MS, rulesForPreset } from '../../src/core';
import type { Clock, WorldRules } from '../../src/core';

const rules = (patch: Partial<WorldRules> = {}): WorldRules => ({ ...rulesForPreset('classic'), ...patch });

describe('advanceClock', () => {
  it('advances game time by real time at timeScale 1', () => {
    const clock: Clock = { gameNow: 1000, realNow: 1000 };
    advanceClock(clock, 1000 + 5000, rules());
    expect(clock).toEqual({ gameNow: 6000, realNow: 6000 });
  });

  it('multiplies elapsed time by timeScale', () => {
    const clock: Clock = { gameNow: 0, realNow: 0 };
    advanceClock(clock, 30_000, rules({ timeScale: 60 }));
    expect(clock.gameNow).toBe(30 * MINUTE_MS);
  });

  it('ignores a clock that moved backwards and keeps the anchor', () => {
    const clock: Clock = { gameNow: 10_000, realNow: 10_000 };
    advanceClock(clock, 4_000, rules());
    expect(clock).toEqual({ gameNow: 10_000, realNow: 10_000 });
    // Coming back to the original time earns nothing extra; only time past the anchor counts.
    advanceClock(clock, 12_000, rules());
    expect(clock).toEqual({ gameNow: 12_000, realNow: 12_000 });
  });
});

describe('offline progress', () => {
  const gap = 10 * HOUR_MS;

  it('always credits short gaps fully', () => {
    for (const offlineProgress of ['full', 'capped', 'paused'] as const) {
      expect(creditedRealMs(OFFLINE_GAP_MS, rules({ offlineProgress }))).toBe(OFFLINE_GAP_MS);
    }
  });

  it('full: credits the whole absence', () => {
    expect(creditedRealMs(gap, rules({ offlineProgress: 'full' }))).toBe(gap);
  });

  it('capped: credits up to offlineCapHours', () => {
    expect(creditedRealMs(gap, rules({ offlineProgress: 'capped', offlineCapHours: 4 }))).toBe(4 * HOUR_MS);
    expect(creditedRealMs(2 * HOUR_MS, rules({ offlineProgress: 'capped', offlineCapHours: 4 }))).toBe(2 * HOUR_MS);
  });

  it('paused: credits nothing for a long absence', () => {
    expect(creditedRealMs(gap, rules({ offlineProgress: 'paused' }))).toBe(0);
  });

  it('applies timeScale on top of the credited time', () => {
    const clock: Clock = { gameNow: 0, realNow: 0 };
    advanceClock(clock, gap, rules({ offlineProgress: 'capped', offlineCapHours: 1, timeScale: 2 }));
    expect(clock.gameNow).toBe(2 * HOUR_MS);
    expect(clock.realNow).toBe(gap);
  });
});
