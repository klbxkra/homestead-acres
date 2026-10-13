import { describe, expect, it } from 'vitest';
import { cropStage, GROWTH_STAGES, HOUR_MS, MINUTE_MS, plotStatus } from '../../src/core';
import { Harness } from './harness';

function plantStrawberry(h: Harness) {
  h.ok({ type: 'plow', x: 0, y: 0 });
  h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
  return () => plotStatus(h.plot(0, 0)!, h.gameNow, h.state.rules);
}

describe('crop growth', () => {
  it('is ripe exactly at its grow time (strawberries: 4h)', () => {
    const h = new Harness();
    const status = plantStrawberry(h);
    expect(status()).toBe('growing');
    h.advance(4 * HOUR_MS - 1000);
    expect(status()).toBe('growing');
    h.advance(1000);
    expect(status()).toBe('ripe');
  });

  it('cropGrowth 0.5 halves the grow time', () => {
    const h = new Harness({ cropGrowth: 0.5 });
    const status = plantStrawberry(h);
    h.advanceHours(1.99);
    expect(status()).toBe('growing');
    h.advanceHours(0.01);
    expect(status()).toBe('ripe');
  });

  it('timeScale 60 makes a 4h crop take 4 real minutes', () => {
    const h = new Harness({ timeScale: 60 });
    const status = plantStrawberry(h);
    h.advance(4 * MINUTE_MS - 1000);
    expect(status()).toBe('growing');
    h.advance(1000);
    expect(status()).toBe('ripe');
  });

  it('a per-crop growMs override replaces the base, then cropGrowth applies', () => {
    const h = new Harness({ cropGrowth: 0.5, overrides: { strawberry: { growMs: 2 * HOUR_MS } } });
    const status = plantStrawberry(h);
    h.advanceHours(1);
    expect(status()).toBe('ripe');
  });

  it('moves through growth stages, then reaches the ripe stage', () => {
    const h = new Harness();
    plantStrawberry(h);
    const stage = () => cropStage(h.plot(0, 0)!.crop!, h.gameNow);
    const seen: number[] = [stage()];
    for (let i = 0; i < 8; i++) {
      h.advanceHours(0.5);
      seen.push(stage());
    }
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(GROWTH_STAGES);
    expect(seen).toEqual([...seen].sort((a, b) => a - b)); // never goes backwards
    expect(new Set(seen).size).toBe(GROWTH_STAGES + 1);
  });

  it('rule changes do not change the ripe time of crops already planted', () => {
    const h = new Harness();
    const status = plantStrawberry(h);
    h.state.rules.cropGrowth = 0.1;
    h.advanceHours(3.9);
    expect(status()).toBe('growing');
  });
});

describe('withering', () => {
  it('withers after another grow-time of being ripe (factor 1)', () => {
    const h = new Harness();
    const status = plantStrawberry(h);
    h.advanceHours(4 + 3.99);
    expect(status()).toBe('ripe');
    h.advanceHours(0.01);
    expect(status()).toBe('withered');
  });

  it('witherWindowFactor scales the ripe window', () => {
    const h = new Harness({ witherWindowFactor: 0.5 });
    const status = plantStrawberry(h);
    h.advanceHours(4 + 1.99);
    expect(status()).toBe('ripe');
    h.advanceHours(0.01);
    expect(status()).toBe('withered');
  });

  it('never withers when withering is off', () => {
    const h = new Harness({ witherEnabled: false });
    const status = plantStrawberry(h);
    h.advanceHours(24 * 365);
    expect(status()).toBe('ripe');
  });

  it('turning withering off revives crops that had withered', () => {
    const h = new Harness();
    const status = plantStrawberry(h);
    h.advanceHours(10);
    expect(status()).toBe('withered');
    h.state.rules.witherEnabled = false;
    expect(status()).toBe('ripe');
  });
});
