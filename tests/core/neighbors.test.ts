import { describe, expect, it } from 'vitest';
import { defaultContent } from '../../src/content';
import type { Content } from '../../src/content';
import {
  cropStatus,
  DAY_MS,
  dayIndex,
  footprintOf,
  helpKindFor,
  helpsLeft,
  HOUR_MS,
  neighborFarm,
  neighborLevel,
  rectsOverlap,
  rulesForPreset,
  visitedFarm,
  worldNeedsUpdate,
} from '../../src/core';
import type { Entity, WorldRules } from '../../src/core';
import { Harness } from './harness';

/** Content with neighbour visits always (or never) happening, for predictable tests. */
function withVisitChance(p: number): Content {
  const c = structuredClone(defaultContent) as unknown as { base: { neighbors: { visitChance: number } } };
  c.base.neighbors.visitChance = p;
  return c as unknown as Content;
}

const neighborly = (rules: Partial<WorldRules> = {}, content?: Content) => new Harness({ aiNeighborCount: 5, ...rules }, content);

/** Advance to just after the next game midnight. */
function nextDay(h: Harness): void {
  const msToMidnight = (dayIndex(h.gameNow) + 1) * DAY_MS - h.gameNow;
  h.advance(msToMidnight / h.state.rules.timeScale + 1000, { asOneGap: true });
}

describe('AI neighbours', () => {
  it('are generated with unique names, and the first two send welcome gifts', () => {
    const h = neighborly();
    h.advance(1000); // the first tick generates them
    const list = h.player.social.neighbors;
    expect(list).toHaveLength(5);
    expect(new Set(list.map((n) => n.name)).size).toBe(5);
    expect(h.player.social.mailbox.map((m) => m.neighborId)).toEqual([list[0]!.id, list[1]!.id]);
  });

  it('are the same for the same save, and keep their identity when the count changes', () => {
    const a = neighborly();
    const b = neighborly();
    a.advance(1000);
    b.advance(1000);
    expect(a.player.social.neighbors).toEqual(b.player.social.neighbors);
    const firstFive = a.player.social.neighbors.map((n) => n.name);
    a.ok({ type: 'setRules', rules: { ...a.state.rules, aiNeighborCount: 8 } });
    a.advance(1000);
    expect(a.player.social.neighbors.slice(0, 5).map((n) => n.name)).toEqual(firstFive);
    expect(a.player.social.neighbors).toHaveLength(8);
  });

  it('send aiGiftsPerDay gifts each game day, catching up at most backlogDays after a long absence', () => {
    const h = neighborly({ aiGiftsPerDay: 1 });
    h.advance(1000);
    for (let i = 0; i < 10; i++) nextDay(h);
    expect(h.player.social.mailbox).toHaveLength(2 + 10);

    const away = neighborly({ aiGiftsPerDay: 1 });
    away.advance(1000);
    away.advanceHours(24 * 20); // one long gap
    expect(away.player.social.mailbox).toHaveLength(2 + defaultContent.base.neighbors.backlogDays);
  });

  it('never fill the mailbox past its limit', () => {
    const h = neighborly({ aiGiftsPerDay: 20 });
    for (let i = 0; i < 5; i++) nextDay(h);
    expect(h.player.social.mailbox).toHaveLength(defaultContent.base.neighbors.mailboxMax);
  });

  it('gifts are accepted into the gift box, all at once or one by one', () => {
    const h = neighborly({ aiGiftsPerDay: 2 });
    nextDay(h);
    const mail = h.player.social.mailbox;
    const first = mail[0]!;
    h.ok({ type: 'acceptGifts', mailIds: [first.id] });
    expect(h.player.giftBox[first.itemId]).toBeGreaterThanOrEqual(first.count);
    expect(h.player.social.mailbox).toHaveLength(mail.length - 1);
    h.ok({ type: 'acceptGifts' });
    expect(h.player.social.mailbox).toHaveLength(0);
    expect(h.player.stats.counters['giftsAccepted']).toBe(mail.length);
    h.fails({ type: 'acceptGifts' }, 'nothing_to_do');
  });

  it('visit to fertilize growing crops, which then sell for more', () => {
    const h = neighborly({ aiGiftsPerDay: 0 }, withVisitChance(1));
    h.cheat({ coins: 10_000 });
    for (let x = 0; x < 4; x++) {
      h.ok({ type: 'plow', x, y: 0 });
      h.ok({ type: 'plant', x, y: 0, cropId: 'soybean' }); // 24h, sells for 63
    }
    nextDay(h);
    const fertilized = [0, 1, 2, 3].filter((x) => h.plot(x, 0)!.crop!.fertilized);
    expect(fertilized.length).toBe(4); // 5 visitors, up to 4 crops each
    expect(h.player.social.log.at(-1)).toMatchObject({ kind: 'fertilized' });

    h.advanceHours(24);
    const coins = h.player.coins;
    h.ok({ type: 'harvest', x: 0, y: 0 });
    expect(h.player.coins - coins).toBe(Math.round(63 * 1.25));
  });

  it('feed animals in buildings when there are no crops to fertilize', () => {
    const h = neighborly({ aiGiftsPerDay: 0 }, withVisitChance(1));
    h.cheat({ level: 10, coins: 10_000 });
    h.ok({ type: 'buy', itemId: 'chicken_coop', x: 0, y: 0 });
    h.ok({ type: 'buy', itemId: 'chicken', x: 0, y: 0 });
    h.fails({ type: 'harvest', x: 0, y: 0 }, 'not_ripe');
    nextDay(h);
    expect(h.player.social.log.at(-1)).toMatchObject({ kind: 'fed', count: 1 });
    h.ok({ type: 'harvest', x: 0, y: 0 });
  });

  it('only run once per game day (tick has nothing to do mid-day)', () => {
    const h = neighborly();
    h.advance(1000);
    expect(worldNeedsUpdate(h.state)).toBe(false);
    nextDay(h);
    expect(worldNeedsUpdate(h.state)).toBe(false);
    expect(h.player.social.processedDay).toBe(dayIndex(h.gameNow));
  });

  it('do nothing when there are none', () => {
    const h = new Harness({ aiNeighborCount: 0, aiGiftsPerDay: 5 });
    nextDay(h);
    expect(h.player.social.neighbors).toHaveLength(0);
    expect(h.player.social.mailbox).toHaveLength(0);
  });
});

describe('visiting neighbours', () => {
  function visit(h: Harness) {
    h.advance(1000);
    const n = h.player.social.neighbors[0]!;
    const farm = neighborFarm(n, neighborLevel(n, h.player, h.content), dayIndex(h.gameNow), h.content, h.state.rules);
    const helpable = Object.values(farm.entities).filter((e) => helpKindFor(e, h.gameNow, h.state.rules));
    return { n, farm, helpable };
  }

  it('their farms are the same all day, differ between days, and nothing overlaps', () => {
    const rules = rulesForPreset('classic');
    const h = neighborly();
    h.advance(1000);
    for (const n of h.player.social.neighbors) {
      for (const level of [1, 8, 20, 45]) {
        for (const day of [100, 101]) {
          const farm = neighborFarm(n, level, day, defaultContent, rules);
          expect(neighborFarm(n, level, day, defaultContent, rules)).toEqual(farm);
          const list: Entity[] = Object.values(farm.entities);
          for (let i = 0; i < list.length; i++) {
            const a = footprintOf(list[i]!, defaultContent);
            expect(a.x + a.w).toBeLessThanOrEqual(farm.width);
            expect(a.y + a.h).toBeLessThanOrEqual(farm.height);
            for (let j = i + 1; j < list.length; j++) expect(rectsOverlap(a, footprintOf(list[j]!, defaultContent))).toBe(false);
          }
          // Only crops they could have unlocked.
          for (const e of list) if (e.kind === 'plot' && e.crop) expect(defaultContent.crops[e.crop.cropId]!.unlockLevel).toBeLessThanOrEqual(level);
        }
      }
    }
    const n = h.player.social.neighbors[0]!;
    expect(neighborFarm(n, 10, 100, defaultContent, rules)).not.toEqual(neighborFarm(n, 10, 101, defaultContent, rules));
  });

  it('pays coins and XP per help, once per thing, up to the daily limit', () => {
    const h = neighborly();
    const { n, farm, helpable } = visit(h);
    expect(helpable.length).toBeGreaterThan(5);
    const target = helpable[0]!;
    const coins = h.player.coins;
    const xp = h.player.xp;
    const events = h.ok({ type: 'helpNeighbor', neighborId: n.id, x: target.x, y: target.y });
    expect(events).toContainEqual(expect.objectContaining({ type: 'neighborHelped', coins: 10 }));
    expect(h.player.coins).toBe(coins + 10);
    expect(h.player.xp).toBe(xp + 2);
    h.fails({ type: 'helpNeighbor', neighborId: n.id, x: target.x, y: target.y }, 'nothing_to_do');

    const fence = Object.values(farm.entities).find((e) => e.kind === 'decoration')!;
    h.fails({ type: 'helpNeighbor', neighborId: n.id, x: fence.x, y: fence.y }, 'nothing_to_do');
    h.fails({ type: 'helpNeighbor', neighborId: 'nobody', x: target.x, y: target.y }, 'unknown_entity');

    for (const e of helpable.slice(1, 4)) h.ok({ type: 'helpNeighbor', neighborId: n.id, x: e.x, y: e.y });
    const mail = h.player.social.mailbox.length;
    const last = h.ok({ type: 'helpNeighbor', neighborId: n.id, x: helpable[4]!.x, y: helpable[4]!.y });
    expect(last).toContainEqual(expect.objectContaining({ type: 'neighborThanks', neighborId: n.id }));
    expect(h.player.social.mailbox).toHaveLength(mail + 1);
    expect(helpsLeft(h.player.social.neighbors[0]!, h.gameNow, h.state.rules)).toBe(0);
    h.fails({ type: 'helpNeighbor', neighborId: n.id, x: helpable[5]!.x, y: helpable[5]!.y }, 'limit_reached');
    expect(h.player.stats.counters['neighborHelps']).toBe(5);
  });

  it('helps reset the next game day', () => {
    const h = neighborly();
    const { n, helpable } = visit(h);
    for (const e of helpable.slice(0, 5)) h.ok({ type: 'helpNeighbor', neighborId: n.id, x: e.x, y: e.y });
    nextDay(h);
    expect(helpsLeft(h.player.social.neighbors[0]!, h.gameNow, h.state.rules)).toBe(5);
    const today = neighborFarm(n, neighborLevel(n, h.player, h.content), dayIndex(h.gameNow), h.content, h.state.rules);
    const e = Object.values(today.entities).find((x) => helpKindFor(x, h.gameNow, h.state.rules))!;
    h.ok({ type: 'helpNeighbor', neighborId: n.id, x: e.x, y: e.y });
  });

  it('follows the neighborHelpsPerDay rule', () => {
    const h = neighborly({ neighborHelpsPerDay: 2 });
    const { n, helpable } = visit(h);
    for (const e of helpable.slice(0, 2)) h.ok({ type: 'helpNeighbor', neighborId: n.id, x: e.x, y: e.y });
    h.fails({ type: 'helpNeighbor', neighborId: n.id, x: helpable[2]!.x, y: helpable[2]!.y }, 'limit_reached');
  });

  it('shows withered crops you helped with as revived', () => {
    const h = neighborly();
    h.advance(1000);
    const n = h.player.social.neighbors[0]!;
    const farm = neighborFarm(n, neighborLevel(n, h.player, h.content), dayIndex(h.gameNow), h.content, h.state.rules);
    const withered = Object.values(farm.entities).find((e) => e.kind === 'plot' && e.crop && cropStatus(e.crop, h.gameNow, h.state.rules) === 'withered')!;
    expect(withered).toBeDefined();
    h.ok({ type: 'helpNeighbor', neighborId: n.id, x: withered.x, y: withered.y });
    const seen = visitedFarm(h.player.social.neighbors[0]!, h.player, h.gameNow, h.content, h.state.rules).entities[withered.id]!;
    expect(seen.kind === 'plot' && seen.crop && cropStatus(seen.crop, h.gameNow, h.state.rules)).toBe('ripe');
  });

  it('their level keeps pace with yours', () => {
    const h = neighborly();
    h.advance(1000);
    const n = h.player.social.neighbors[0]!;
    expect(neighborLevel(n, h.player, h.content)).toBe(Math.max(1, 1 + n.levelOffset));
    h.cheat({ level: 20 });
    expect(neighborLevel(n, h.player, h.content)).toBe(20 + n.levelOffset);
  });

  it('runs neighbour days in game time, so faster game speeds speed them up', () => {
    const h = neighborly({ timeScale: 24, aiGiftsPerDay: 1 });
    h.advance(1000);
    h.advance(HOUR_MS * 3); // 3 real hours = 3 game days
    expect(h.player.social.mailbox.length).toBeGreaterThanOrEqual(2 + 2);
  });
});
