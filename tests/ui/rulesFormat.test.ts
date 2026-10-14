import { describe, expect, it } from 'vitest';
import { formatGrowth, formatHours, formatMultiplier, formatTimeScale, nearestStopIndex, STOPS } from '../../src/ui/rulesFormat';

describe('rules formatting', () => {
  it('finds the nearest slider stop, even for values between stops', () => {
    expect(nearestStopIndex(STOPS.timeScale, 600)).toBe(STOPS.timeScale.indexOf(600));
    expect(nearestStopIndex(STOPS.timeScale, 590)).toBe(STOPS.timeScale.indexOf(600));
    expect(nearestStopIndex(STOPS.timeScale, 0.1)).toBe(0);
    expect(nearestStopIndex(STOPS.timeScale, 99_999)).toBe(STOPS.timeScale.length - 1);
  });

  it('every preset value sits exactly on a stop', async () => {
    const { PRESET_IDS, rulesForPreset } = await import('../../src/core');
    for (const id of PRESET_IDS) {
      const r = rulesForPreset(id);
      expect(STOPS.timeScale).toContain(r.timeScale);
      expect(STOPS.cropGrowth).toContain(r.cropGrowth);
      expect(STOPS.witherWindowFactor).toContain(r.witherWindowFactor);
      expect(STOPS.reward).toContain(r.coinYield);
      expect(STOPS.reward).toContain(r.xpGain);
      expect(STOPS.cost).toContain(r.buyCost);
      expect(STOPS.startingCoins).toContain(r.startingCoins);
      expect(STOPS.startingCash).toContain(r.startingCash);
      expect(STOPS.offlineCapHours).toContain(r.offlineCapHours);
    }
  });

  it('labels values the way players think about them', () => {
    expect(formatTimeScale(1)).toBe('Real time');
    expect(formatTimeScale(60)).toBe('×60 (1 game hour = 1 min)');
    expect(formatTimeScale(600)).toBe('×600 (1 game hour = 6 s)');
    expect(formatGrowth(0.5)).toBe('×0.5 (2× faster)');
    expect(formatGrowth(2)).toBe('×2 (2× slower)');
    expect(formatMultiplier(1.5)).toBe('×1.5');
    expect(formatHours(12)).toBe('12 h');
    expect(formatHours(72)).toBe('3 d');
  });
});
