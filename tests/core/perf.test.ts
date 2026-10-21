/**
 * Guards against the reducer getting slow on the biggest farm: every command
 * copies the state and many tools look up tiles, so a full 26x26 farm must stay
 * well inside a frame.
 */
import { describe, expect, it } from 'vitest';
import { entityAt } from '../../src/core';
import { Harness } from './harness';

function bigFarm(): Harness {
  const h = new Harness({ aiNeighborCount: 5 });
  h.cheat({ level: 70, coins: 1e9, cash: 1e6 });
  for (let i = 0; i < 7; i++) h.ok({ type: 'expandFarm' });
  for (let y = 0; y < 26; y++) {
    for (let x = 0; x < 26; x++) {
      h.ok({ type: 'plow', x, y });
      h.ok({ type: 'plant', x, y, cropId: 'strawberry' });
    }
  }
  return h;
}

describe('performance on a full 26x26 farm', () => {
  it('applies a command in well under a frame', () => {
    const h = bigFarm();
    expect(Object.keys(h.farm.entities)).toHaveLength(676);
    h.advanceHours(4);
    const start = performance.now();
    for (let x = 0; x < 26; x++) h.ok({ type: 'harvest', x, y: 25 });
    const perCommand = (performance.now() - start) / 26;
    console.info(`harvest command on 676 plots: ${perCommand.toFixed(2)} ms`);
    expect(perCommand).toBeLessThan(8);
  });

  it('looks up tiles quickly', () => {
    const h = bigFarm();
    const start = performance.now();
    for (let i = 0; i < 2000; i++) entityAt(h.farm, i % 26, Math.floor(i / 26) % 26, h.content);
    const perLookup = (performance.now() - start) / 2000;
    console.info(`entityAt on 676 entities: ${(perLookup * 1000).toFixed(1)} µs`);
    expect(perLookup).toBeLessThan(0.5);
  });
});
