import { describe, expect, it } from 'vitest';
import { matchingPreset, PRESET_IDS, RULE_LIMITS, rulesForPreset, validateRules } from '../../src/core';

const classic = () => rulesForPreset('classic');

describe('validateRules', () => {
  it('accepts every preset unchanged', () => {
    for (const id of PRESET_IDS) {
      const r = validateRules(rulesForPreset(id));
      expect(r.ok && r.rules).toEqual(rulesForPreset(id));
    }
  });

  it('drops unknown keys and empty overrides', () => {
    const r = validateRules({ ...classic(), hacked: true, overrides: { strawberry: { growMs: 5000, bogus: 1 }, wheat: {} } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rules).not.toHaveProperty('hacked');
      expect(r.rules.overrides).toEqual({ strawberry: { growMs: 5000 } });
    }
  });

  it('rejects wrong types, out-of-range numbers and bad enums', () => {
    const bad: [string, unknown][] = [
      ['timeScale', 0],
      ['timeScale', Number.NaN],
      ['timeScale', Infinity],
      ['timeScale', '600'],
      ['coinYield', -1],
      ['xpGain', 101],
      ['aiNeighborCount', 2.5],
      ['startingCoins', 10.5],
      ['witherEnabled', 'yes'],
      ['offlineProgress', 'sometimes'],
      ['preset', 'cheat'],
      ['overrides', []],
    ];
    for (const [key, value] of bad) {
      expect(validateRules({ ...classic(), [key]: value }).ok, `${key}=${String(value)}`).toBe(false);
    }
    expect(validateRules(null).ok).toBe(false);
    expect(validateRules([]).ok).toBe(false);
    const missing = { ...classic() } as Record<string, unknown>;
    delete missing['timeScale'];
    expect(validateRules(missing).ok).toBe(false);
  });

  it('rejects bad overrides, including prototype keys', () => {
    expect(validateRules({ ...classic(), overrides: { strawberry: { growMs: 10 } } }).ok).toBe(false); // < 1s
    expect(validateRules({ ...classic(), overrides: { strawberry: { cost: -5 } } }).ok).toBe(false);
    expect(validateRules({ ...classic(), overrides: { strawberry: 'free' } }).ok).toBe(false);
    expect(validateRules({ ...classic(), overrides: JSON.parse('{"__proto__": {"cost": 1}}') }).ok).toBe(false);
  });

  it('accepts the exact limits', () => {
    const r = { ...classic() } as Record<string, unknown>;
    for (const [key, limit] of Object.entries(RULE_LIMITS)) r[key] = limit.max;
    expect(validateRules(r).ok).toBe(true);
  });
});

describe('matchingPreset', () => {
  it('recognises presets regardless of label and starting values', () => {
    expect(matchingPreset(rulesForPreset('relaxed'))).toBe('relaxed');
    expect(matchingPreset({ ...rulesForPreset('relaxed'), preset: 'custom', startingCoins: 9999 })).toBe('relaxed');
    expect(matchingPreset({ ...classic(), coinYield: 3 })).toBeNull();
    expect(matchingPreset({ ...classic(), overrides: { strawberry: { cost: 1 } } })).toBeNull();
  });
});
