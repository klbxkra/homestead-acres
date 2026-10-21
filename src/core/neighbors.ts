/**
 * AI neighbours (PLAN.md section 4.8), replacing FarmVille's Facebook friends:
 * - generated farmers who send gifts and visit to fertilize crops or feed animals
 *   once per game day (caught up when you come back, up to a few days);
 * - farms of their own you can visit and help on, a few times per neighbour per day;
 * - a mailbox for their gifts.
 * Their farms are generated from a seed and the day, never stored, so visiting
 * costs nothing in the save.
 */
import type { Content, CropDef } from '../content';
import { contractPartnersWork } from './contracts';
import { bump, pickIndex, pickWeighted, reject, roll } from './context';
import type { Ctx, Tile } from './context';
import { cropStatus } from './crops';
import { cropGrowMs, neighborHelpCoins, neighborHelpXp } from './economy';
import type { HelpKind } from './events';
import { entityAt } from './grid';
import { allocateId, lookup } from './ids';
import { gainXp, maxLevel } from './progression';
import { addCounter, rollCollectibles } from './rewards';
import { nextFloat, nextInt, seedFromString } from './rng';
import type { WorldRules } from './rules';
import type { Entity, FarmState, GameState, NeighborState, PlayerState, PlotEntity } from './state';
import { DAY_MS } from './time';

/** Most neighbours that can ever exist (matches the aiNeighborCount limit). */
export const MAX_NEIGHBORS = 20;

export function dayIndex(gameNow: number): number {
  return Math.floor(gameNow / DAY_MS);
}

export function activeNeighbors(player: PlayerState, rules: WorldRules): NeighborState[] {
  return player.social.neighbors.slice(0, rules.aiNeighborCount);
}

export function neighborLevel(neighbor: NeighborState, player: PlayerState, content: Content): number {
  return Math.min(maxLevel(content.levels), Math.max(1, player.level + neighbor.levelOffset));
}

/** Helps still available on this neighbour's farm today. */
export function helpsLeft(neighbor: NeighborState, gameNow: number, rules: WorldRules): number {
  const used = neighbor.helpDay === dayIndex(gameNow) ? neighbor.helped.length : 0;
  return Math.max(0, rules.neighborHelpsPerDay - used);
}

/** True when tick() has neighbour work to do (a new game day, or neighbours still to generate). */
export function worldNeedsUpdate(state: GameState): boolean {
  const today = dayIndex(state.clock.gameNow);
  return Object.values(state.players).some(
    (p) => today > p.social.processedDay || p.social.neighbors.length < Math.min(MAX_NEIGHBORS, state.rules.aiNeighborCount),
  );
}

/**
 * Runs neighbour activity for every game day since the last update (at most
 * `backlogDays` of them) and generates missing neighbours. Called before every
 * command and from tick(), so it's cheap when there's nothing to do.
 */
export function updateWorld(ctx: Ctx): void {
  ensureNeighbors(ctx);
  const social = ctx.player.social;
  const today = dayIndex(ctx.now);
  if (today <= social.processedDay) return;
  const first = Math.max(social.processedDay + 1, today - ctx.content.base.neighbors.backlogDays + 1);
  for (let day = first; day <= today; day++) runDay(ctx, day * DAY_MS);
  social.processedDay = today;
}

function ensureNeighbors(ctx: Ctx): void {
  const { player, content, rules } = ctx;
  const list = player.social.neighbors;
  const wanted = Math.min(MAX_NEIGHBORS, rules.aiNeighborCount);
  if (list.length >= wanted) return;
  const firstTime = list.length === 0;
  const pool = content.neighborPool;
  while (list.length < wanted) {
    const i = list.length;
    let r = seedFromString(`${player.social.seed}:${i}`);
    const pick = (n: number) => {
      const out = nextInt(r, 0, n - 1);
      r = out.state;
      return out.value;
    };
    const taken = new Set(list.map((n) => n.name));
    const free = pool.names.filter((name) => !taken.has(name));
    const name = free.length ? free[pick(free.length)]! : `${pool.names[pick(pool.names.length)]!} ${i + 1}`;
    const [lo, hi] = content.base.neighbors.levelOffset;
    list.push({
      id: `neighbor${i + 1}`,
      name,
      avatar: pool.avatars[pick(pool.avatars.length)]!,
      color: pool.colors[pick(pool.colors.length)]!,
      levelOffset: lo + pick(hi - lo + 1),
      seed: r,
      helpDay: -1,
      helped: [],
      helpsGiven: 0,
    });
  }
  // New neighbours say hello: the first two send a welcome gift.
  if (firstTime) for (const n of list.slice(0, 2)) sendGift(ctx, n.id, ctx.now);
}

function runDay(ctx: Ctx, dayStart: number): void {
  const { rules, content } = ctx;
  const neighbors = activeNeighbors(ctx.player, rules);
  if (neighbors.length) {
    const g = rules.aiGiftsPerDay;
    const gifts = Math.floor(g) + (roll(ctx, g - Math.floor(g)) ? 1 : 0);
    for (let i = 0; i < gifts; i++) sendGift(ctx, neighbors[pickIndex(ctx, neighbors.length)]!.id, dayStart);
    for (const n of neighbors) if (roll(ctx, content.base.neighbors.visitChance)) visitPlayer(ctx, n, dayStart);
  }
  contractPartnersWork(ctx, dayStart);
  const log = ctx.player.social.log;
  if (log.length > content.base.neighbors.logMax) log.splice(0, log.length - content.base.neighbors.logMax);
}

/** Puts a random gift from this neighbour in the mailbox (unless it's full). Returns the item id. */
function sendGift(ctx: Ctx, neighborId: string, at: number): string | null {
  const { player, content } = ctx;
  const mailbox = player.social.mailbox;
  if (mailbox.length >= content.base.neighbors.mailboxMax) return null;
  const needed = partsNeeded(ctx.farm, content);
  const options = content.gifts.filter((g) => g.unlockLevel <= player.level);
  // Parts an unfinished building still needs turn up three times as often.
  const gift = pickWeighted(ctx, options, (g) => g.weight * (needed.has(g.itemId) ? 3 : 1));
  if (!gift) return null;
  mailbox.push({ id: allocateId(ctx.state, 'mail'), neighborId, itemId: gift.itemId, count: gift.count, sentAt: at });
  return gift.itemId;
}

/** Part ids still missing from unfinished construction buildings on this farm. */
function partsNeeded(farm: FarmState, content: Content): Set<string> {
  const out = new Set<string>();
  for (const e of Object.values(farm.entities)) {
    if (e.kind !== 'building' || !e.parts) continue;
    const need = lookup(content.buildings, e.itemId)?.construction ?? {};
    for (const [part, n] of Object.entries(need)) if ((lookup(e.parts, part) ?? 0) < n) out.add(part);
  }
  return out;
}

/** A neighbour drops by: fertilizes some growing crops, or else feeds a building's animals. */
function visitPlayer(ctx: Ctx, neighbor: NeighborState, at: number): void {
  const { farm, rules, content } = ctx;
  const growing = Object.values(farm.entities).filter(
    (e): e is PlotEntity => e.kind === 'plot' && !!e.crop && !e.crop.fertilized && cropStatus(e.crop, ctx.now, rules) === 'growing',
  );
  if (growing.length) {
    const count = Math.min(content.base.neighbors.fertilizePerVisit, growing.length);
    for (let i = 0; i < count; i++) {
      const [plot] = growing.splice(pickIndex(ctx, growing.length), 1);
      plot!.crop!.fertilized = true;
    }
    ctx.player.social.log.push({ at, neighborId: neighbor.id, kind: 'fertilized', count });
    return;
  }
  const hungry = Object.values(farm.entities).filter(
    (e) => e.kind === 'building' && e.parts === undefined && e.housed.some((a) => a.readyAt > ctx.now && lookup(content.animals, a.itemId)),
  );
  if (!hungry.length) return;
  const building = hungry[pickIndex(ctx, hungry.length)]!;
  if (building.kind !== 'building') return;
  let fed = 0;
  for (const a of building.housed) {
    if (a.readyAt > ctx.now && lookup(content.animals, a.itemId)) {
      a.readyAt = ctx.now;
      fed++;
    }
  }
  ctx.player.social.log.push({ at, neighborId: neighbor.id, kind: 'fed', count: fed });
}

// ---------------------------------------------------------------- commands

/** Help with one thing on a neighbour's farm: coins and XP for you, and a thank-you gift after the last help of the day. */
export function helpNeighbor(ctx: Ctx, neighborId: string, at: Tile): void {
  const { player, rules, content } = ctx;
  const neighbor = activeNeighbors(player, rules).find((n) => n.id === neighborId) ?? reject('unknown_entity', 'No such neighbor.');
  const today = dayIndex(ctx.now);
  if (neighbor.helpDay !== today) {
    neighbor.helpDay = today;
    neighbor.helped = [];
  }
  if (neighbor.helped.length >= rules.neighborHelpsPerDay) reject('limit_reached', `You've helped ${neighbor.name} as much as you can today.`);
  const farm = neighborFarm(neighbor, neighborLevel(neighbor, player, content), today, content, rules);
  const entity = entityAt(farm, at.x, at.y, content);
  const help = entity ? helpKindFor(entity, ctx.now, rules) : null;
  if (!entity || !help) reject('nothing_to_do', 'Nothing to help with there.');
  if (neighbor.helped.includes(entity.id)) reject('nothing_to_do', 'You already helped here today.');

  neighbor.helped.push(entity.id);
  neighbor.helpsGiven++;
  const coins = neighborHelpCoins(content, rules);
  player.coins += coins;
  ctx.events.push({ type: 'neighborHelped', neighborId, x: entity.x, y: entity.y, coins, help });
  gainXp(player, neighborHelpXp(content, rules), content.levels, rules, ctx.events);
  addCounter(ctx, 'neighborHelps');
  addCounter(ctx, 'coinsEarned', coins);
  rollCollectibles(ctx, { neighbor: true }, at);
  // A thank-you gift for a full day's help (unless gifts are switched off).
  if (neighbor.helped.length === rules.neighborHelpsPerDay) {
    ctx.events.push({ type: 'neighborThanks', neighborId, itemId: rules.aiGiftsPerDay > 0 ? sendGift(ctx, neighborId, ctx.now) : null });
  }
}

/** What helping would do here, or null when there's nothing to help with. */
export function helpKindFor(entity: Entity, gameNow: number, rules: WorldRules): HelpKind | null {
  switch (entity.kind) {
    case 'plot':
      if (!entity.crop) return null;
      return cropStatus(entity.crop, gameNow, rules) === 'withered' ? 'unwithered' : 'fertilized';
    case 'tree':
      return 'picked';
    case 'animal':
      return 'fed';
    default:
      return null;
  }
}

export function acceptGifts(ctx: Ctx, mailIds: readonly string[] | undefined): void {
  const mailbox = ctx.player.social.mailbox;
  if (mailIds !== undefined && !Array.isArray(mailIds)) reject('invalid', 'mailIds must be a list.');
  const wanted = mailIds ? new Set(mailIds) : null;
  const taking = mailbox.filter((m) => !wanted || wanted.has(m.id));
  if (!taking.length) reject('nothing_to_do', 'No gifts to accept.');
  const items = new Map<string, number>();
  for (const m of taking) {
    bump(ctx.player.giftBox, m.itemId, m.count);
    items.set(m.itemId, (items.get(m.itemId) ?? 0) + m.count);
  }
  ctx.player.social.mailbox = mailbox.filter((m) => !taking.includes(m));
  ctx.events.push({ type: 'giftsAccepted', items: [...items].map(([itemId, count]) => ({ itemId, count })) });
  addCounter(ctx, 'giftsAccepted', taking.length);
}

// ---------------------------------------------------------------- generated farms

/**
 * A neighbour's farm on a given game day. Pure: the same neighbour, level and
 * day always give the same farm, so the reducer can check helps against it and
 * the renderer can draw it without storing anything.
 */
export function neighborFarm(neighbor: NeighborState, level: number, day: number, content: Content, rules: WorldRules): FarmState {
  let r = seedFromString(`${neighbor.seed}:${day}`);
  const rand = () => {
    const out = nextFloat(r);
    r = out.state;
    return out.value;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;

  const size = Math.min(22, 12 + 2 * Math.floor(level / 8));
  const dayStart = day * DAY_MS;
  const entities: Record<string, Entity> = {};
  const base = (id: string, x: number, y: number) => ({ id: `${neighbor.id}-${id}`, ownerId: neighbor.id, x, y });

  // A fence along the top edge.
  for (let x = 0; x < size; x++) entities[`f${x}`] = { ...base(`f${x}`, x, 0), kind: 'decoration', itemId: 'white_fence', rotated: false };

  // The crop field: one to three of the best crops they've unlocked, in mixed states.
  const crops = Object.values(content.crops).filter((c) => c.unlockLevel <= level);
  const favourites: CropDef[] = [];
  const top = crops.slice(-8);
  for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) favourites.push(pick(top));
  const fieldW = size - 7;
  const fieldH = Math.floor(size / 2);
  for (let y = 2; y < 2 + fieldH; y++) {
    for (let x = 1; x < 1 + fieldW; x++) {
      const id = `p${x}-${y}`;
      if (rand() < 0.1) {
        entities[id] = { ...base(id, x, y), kind: 'plot', plowed: true, crop: null };
        continue;
      }
      const crop = favourites[Math.floor(((x - 1) / fieldW) * favourites.length)]!;
      const grow = cropGrowMs(crop, rules);
      const state = rand();
      let readyAt: number;
      if (state < 0.25) readyAt = dayStart - grow * Math.min(0.1, rules.witherWindowFactor * 0.5) * rand(); // ripe
      else if (state < 0.4 && rules.witherEnabled) readyAt = dayStart - grow * (rules.witherWindowFactor + 0.2); // withered
      else readyAt = dayStart + grow * (0.2 + 0.7 * rand()); // growing
      entities[id] = { ...base(id, x, y), kind: 'plot', plowed: true, crop: { cropId: crop.id, plantedAt: readyAt - grow, readyAt } };
    }
  }

  // Animals beside the field.
  const animals = Object.values(content.animals).filter((a) => a.unlockLevel <= level);
  const animalCount = animals.length ? Math.min(8, 1 + Math.floor(level / 4)) : 0;
  for (let i = 0; i < animalCount; i++) {
    const x = size - 5 + (i % 2) * 2;
    const y = 2 + Math.floor(i / 2) * 2;
    if (y >= 2 + fieldH) break;
    const a = pick(animals);
    entities[`a${i}`] = { ...base(`a${i}`, x, y), kind: 'animal', itemId: a.id, readyAt: dayStart + a.cycleMs * (rand() - 0.5) };
  }

  // A coop once they're far enough along, and a row of trees near the bottom.
  const lowY = 2 + fieldH;
  if (level >= 8 && lookup(content.buildings, 'chicken_coop')) {
    entities['coop'] = { ...base('coop', 1, lowY), kind: 'building', itemId: 'chicken_coop', rotated: false, housed: [] };
  }
  const trees = Object.values(content.trees).filter((t) => t.unlockLevel <= level);
  const treeY = size - 2;
  const treeCount = trees.length ? Math.min(size - 2, 2 + Math.floor(level / 3)) : 0;
  for (let i = 0; i < treeCount; i++) {
    const t = pick(trees);
    entities[`t${i}`] = { ...base(`t${i}`, 1 + i, treeY), kind: 'tree', itemId: t.id, readyAt: dayStart + t.cycleMs * (rand() - 0.6) };
  }

  // A few decorations in the gap between the field and the trees.
  const decor = Object.values(content.decorations).filter((d) => d.buyable && d.width === 1 && d.height === 1 && d.unlockLevel <= level);
  for (let i = 0; i < 6 && decor.length; i++) {
    const x = 4 + Math.floor(rand() * (size - 6));
    const y = lowY + Math.floor(rand() * Math.max(1, treeY - lowY));
    const id = `d${x}-${y}`;
    const clash = Object.values(entities).some((e) => e.x === x && e.y === y) || (level >= 8 && x <= 2 && y <= lowY + 1);
    if (!clash && y < treeY) entities[id] = { ...base(id, x, y), kind: 'decoration', itemId: pick(decor).id, rotated: false };
  }

  // Ids are keyed by entity id like a real farm.
  const keyed: Record<string, Entity> = {};
  for (const e of Object.values(entities)) keyed[e.id] = e;
  return { id: `visit-${neighbor.id}`, ownerId: neighbor.id, name: `${neighbor.name}'s Farm`, width: size, height: size, entities: keyed };
}

/**
 * The farm as you see it while visiting: what you've already helped with today
 * shows the result (withered crops revived and fertilized).
 */
export function visitedFarm(neighbor: NeighborState, player: PlayerState, gameNow: number, content: Content, rules: WorldRules): FarmState {
  const today = dayIndex(gameNow);
  const farm = neighborFarm(neighbor, neighborLevel(neighbor, player, content), today, content, rules);
  if (neighbor.helpDay !== today) return farm;
  for (const id of neighbor.helped) {
    const e = lookup(farm.entities, id);
    if (e?.kind !== 'plot' || !e.crop) continue;
    if (cropStatus(e.crop, gameNow, rules) === 'withered') {
      const grow = e.crop.readyAt - e.crop.plantedAt;
      e.crop.readyAt = gameNow;
      e.crop.plantedAt = gameNow - grow;
    }
    e.crop.fertilized = true;
  }
  return farm;
}

/** Entity ids helped on this neighbour's farm today. */
export function helpedToday(neighbor: NeighborState, gameNow: number): ReadonlySet<string> {
  return new Set(neighbor.helpDay === dayIndex(gameNow) ? neighbor.helped : []);
}
