import { describe, expect, it } from 'vitest';
import { contractStatus, contractTotal, DAY_MS, dayIndex, HOUR_MS } from '../../src/core';
import type { WorldRules } from '../../src/core';
import { Harness } from './harness';

/** Strawberry Social: 60 strawberries in 24 hours. */
const JOB = 'strawberry_social';

function setup(rules: Partial<WorldRules> = {}) {
  const h = new Harness({ aiNeighborCount: 5, aiGiftsPerDay: 0, ...rules });
  h.cheat({ level: 10, coins: 100_000 });
  h.advance(1000);
  return h;
}

/** Plows and plants `n` strawberry plots (4h crop) and harvests them when ripe. */
function growStrawberries(h: Harness, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = i % 12;
    const y = Math.floor(i / 12);
    if (!h.plot(x, y)?.plowed) h.ok({ type: 'plow', x, y });
    h.ok({ type: 'plant', x, y, cropId: 'strawberry' });
  }
  h.advanceHours(4);
  for (let i = 0; i < n; i++) h.ok({ type: 'harvest', x: i % 12, y: Math.floor(i / 12) });
}

describe('co-op jobs', () => {
  it('check level, partners and that only one runs at a time', () => {
    const h = new Harness({ aiNeighborCount: 5 });
    h.advance(1000);
    h.fails({ type: 'startContract', contractId: JOB }, 'locked'); // level 2
    h.cheat({ level: 2 });
    h.fails({ type: 'startContract', contractId: 'world_peace' }, 'unknown_item');
    const ids = h.player.social.neighbors.map((n) => n.id);
    h.fails({ type: 'startContract', contractId: JOB, partners: ids.slice(0, 3) }, 'invalid'); // max 2
    h.fails({ type: 'startContract', contractId: JOB, partners: ['stranger'] }, 'invalid');
    h.ok({ type: 'startContract', contractId: JOB, partners: ids.slice(0, 2) });
    expect(h.player.contract).toMatchObject({ contractId: JOB, partners: ids.slice(0, 2), endsAt: h.gameNow + 24 * HOUR_MS });
    h.fails({ type: 'startContract', contractId: JOB }, 'busy');
  });

  it('count your harvests of the goal crops, up to each goal', () => {
    const h = setup();
    h.ok({ type: 'startContract', contractId: JOB });
    growStrawberries(h, 40);
    expect(contractTotal(h.player.contract!, 'strawberry')).toBe(40);
    growStrawberries(h, 30);
    expect(contractTotal(h.player.contract!, 'strawberry')).toBe(60); // capped at the goal
    expect(contractStatus(h.player.contract!, h.gameNow)).toBe('complete');
  });

  it('stop counting a crop once its goal is met, even while other goals are open', () => {
    const h = setup();
    h.ok({ type: 'startContract', contractId: 'pumpkin_party' }); // 80 pumpkins + 40 strawberries
    growStrawberries(h, 50);
    const c = h.player.contract!;
    expect(contractTotal(c, 'strawberry')).toBe(40);
    expect(contractStatus(c, h.gameNow)).toBe('active');
  });

  it('pay gold (with the trophy) for finishing in the first half of the time', () => {
    const h = setup();
    h.ok({ type: 'startContract', contractId: JOB });
    growStrawberries(h, 60); // done after 4 of 24 hours
    expect(h.lastEvents).toContainEqual(expect.objectContaining({ type: 'contractCompleted', medal: 'gold' }));
    const coins = h.player.coins;
    h.ok({ type: 'claimContract' });
    expect(h.lastEvents).toContainEqual(expect.objectContaining({ type: 'contractClaimed', medal: 'gold', coins: 600, xp: 40 }));
    expect(h.player.coins).toBe(coins + 600 + 100); // + the Co-op Champion ribbon's first tier
    expect(h.player.giftBox['gold_trophy']).toBe(1);
    expect(h.player.contractMedals[JOB]).toBe('gold');
    expect(h.player.contract).toBeNull();
    expect(h.player.stats.counters['contractsCompleted']).toBe(1);
  });

  it('pay silver or bronze for finishing later, and keep the best medal', () => {
    const h = setup();
    h.ok({ type: 'startContract', contractId: JOB });
    h.advanceHours(14); // 4h of growing makes it 18/24 = 75% -> silver
    growStrawberries(h, 60);
    h.ok({ type: 'claimContract' });
    expect(h.lastEvents).toContainEqual(expect.objectContaining({ type: 'contractClaimed', medal: 'silver', coins: 360 }));
    expect(h.player.giftBox['gold_trophy']).toBeUndefined();

    h.ok({ type: 'startContract', contractId: JOB });
    h.advanceHours(16); // 20/24 -> bronze
    growStrawberries(h, 60);
    h.ok({ type: 'claimContract' });
    expect(h.lastEvents).toContainEqual(expect.objectContaining({ type: 'contractClaimed', medal: 'bronze', coins: 210 }));
    expect(h.player.contractMedals[JOB]).toBe('silver');
  });

  it('fail when time runs out, paying nothing', () => {
    const h = setup();
    h.ok({ type: 'startContract', contractId: JOB });
    h.fails({ type: 'claimContract' }, 'not_ready');
    growStrawberries(h, 10);
    h.advanceHours(24);
    expect(contractStatus(h.player.contract!, h.gameNow)).toBe('failed');
    growStrawberries(h, 10); // harvests after the deadline don't count
    expect(contractTotal(h.player.contract!, 'strawberry')).toBeLessThan(60);
    const coins = h.player.coins;
    h.ok({ type: 'claimContract' });
    expect(h.lastEvents).toContainEqual({ type: 'contractFailed', contractId: JOB });
    expect(h.player.coins).toBe(coins);
    expect(h.player.contract).toBeNull();
  });

  it('partners grow their share of each goal at the start of every game day', () => {
    const h = setup();
    const [a, b] = h.player.social.neighbors;
    h.ok({ type: 'startContract', contractId: 'bakery_order', partners: [a!.id, b!.id] }); // 60 wheat + 40 soybeans, 4 days
    const msToMidnight = (dayIndex(h.gameNow) + 1) * DAY_MS - h.gameNow;
    h.advance(msToMidnight + 1000, { asOneGap: true });
    const c = h.player.contract!;
    expect(c.progress[a!.id]).toEqual({ wheat: 5, soybean: 4 }); // ceil(8%)
    expect(contractTotal(c, 'wheat')).toBe(10);
  });

  it('can be finished by partners alone given enough days, dated to the day they finished', () => {
    const h = setup({ contractTime: 10 }); // 10 days for the social
    const [a, b] = h.player.social.neighbors;
    h.ok({ type: 'startContract', contractId: JOB, partners: [a!.id, b!.id] });
    h.advance(10 * DAY_MS - HOUR_MS);
    expect(contractStatus(h.player.contract!, h.gameNow)).toBe('complete');
    // 2 partners x 5 strawberries a day: done on the 6th midnight, about 60% of the time -> silver.
    h.ok({ type: 'claimContract' });
    expect(h.lastEvents).toContainEqual(expect.objectContaining({ type: 'contractClaimed', medal: 'silver' }));
  });

  it('follow the contractTime rule, and can be abandoned', () => {
    const h = setup({ contractTime: 2 });
    h.ok({ type: 'startContract', contractId: JOB });
    expect(h.player.contract!.endsAt - h.player.contract!.startedAt).toBe(48 * HOUR_MS);
    h.ok({ type: 'abandonContract' });
    expect(h.player.contract).toBeNull();
    h.fails({ type: 'abandonContract' }, 'nothing_to_do');
  });
});
