import { describe, expect, it } from 'vitest';
import { chance, nextFloat, nextInt, seedFromString } from '../../src/core/rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const run = (seed: number) => {
      const out: number[] = [];
      let s = seed;
      for (let i = 0; i < 5; i++) {
        const r = nextFloat(s);
        out.push(r.value);
        s = r.state;
      }
      return out;
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it('produces floats in [0, 1)', () => {
    let s = 1;
    for (let i = 0; i < 10_000; i++) {
      const r = nextFloat(s);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      s = r.state;
    }
  });

  it('nextInt covers the whole inclusive range', () => {
    const seen = new Set<number>();
    let s = 7;
    for (let i = 0; i < 1000; i++) {
      const r = nextInt(s, 1, 6);
      seen.add(r.value);
      s = r.state;
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('chance roughly matches its probability', () => {
    let s = 99;
    let hits = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const r = chance(s, 0.25);
      if (r.value) hits++;
      s = r.state;
    }
    expect(hits / n).toBeGreaterThan(0.23);
    expect(hits / n).toBeLessThan(0.27);
  });

  it('seedFromString is stable', () => {
    expect(seedFromString('Sunny Farm')).toBe(seedFromString('Sunny Farm'));
    expect(seedFromString('Sunny Farm')).not.toBe(seedFromString('Rainy Farm'));
  });
});
