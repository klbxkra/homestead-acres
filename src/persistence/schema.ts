/**
 * Runtime validation of a GameState loaded from storage or an imported file.
 * Imported files are untrusted, so everything is checked before the game sees it.
 * Plain z.object() strips unknown keys; tests check that a fresh game survives a
 * parse unchanged, which catches this schema falling behind core/state.ts.
 */
import { z } from 'zod';
import type { GameState } from '../core';

const num = z.number(); // zod 4 rejects NaN and Infinity
const int = z.number().int();
const id = z.string().min(1).max(200);

const cropInstance = z.object({ cropId: id, plantedAt: num, readyAt: num });

const entityBase = { id, ownerId: id, x: int, y: int };

const plot = z.object({ ...entityBase, kind: z.literal('plot'), plowed: z.boolean(), crop: cropInstance.nullable() });
const decoration = z.object({ ...entityBase, kind: z.literal('decoration'), itemId: id, rotated: z.boolean() });
const tree = z.object({ ...entityBase, kind: z.literal('tree'), itemId: id, readyAt: num });
const animal = z.object({ ...entityBase, kind: z.literal('animal'), itemId: id, readyAt: num });
const building = z.object({
  ...entityBase,
  kind: z.literal('building'),
  itemId: id,
  rotated: z.boolean(),
  housed: z.array(z.object({ itemId: id, readyAt: num })).max(1000),
});
const entity = z.discriminatedUnion('kind', [plot, decoration, tree, animal, building]);

const farm = z.object({
  id,
  ownerId: id,
  name: z.string().max(200),
  width: int.min(1).max(200),
  height: int.min(1).max(200),
  entities: z.record(z.string(), entity),
});

const player = z.object({
  id,
  name: z.string().max(200),
  coins: num,
  cash: num,
  xp: num,
  level: int.min(1),
  stats: z.object({ harvested: z.record(z.string(), num), counters: z.record(z.string(), num) }),
  masteryStars: z.record(z.string(), int.min(0).max(3)),
  ribbons: z.record(z.string(), int.min(0).max(4)),
  collectibles: z.record(z.string(), int.nonnegative()),
  giftBox: z.record(z.string(), int.nonnegative()),
  storage: z.record(z.string(), int.nonnegative()),
  fuel: z.object({ amount: num, updatedAt: num }),
  vehicles: z.array(id).max(100),
  daily: z.object({ lastClaimRealAt: num.nullable(), streak: int.nonnegative() }),
});

const override = z.object({
  growMs: num.positive().optional(),
  sellPrice: num.nonnegative().optional(),
  cost: num.nonnegative().optional(),
  xp: num.nonnegative().optional(),
});

const rules = z.object({
  preset: z.enum(['classic', 'relaxed', 'idle', 'speedrun', 'custom']),
  timeScale: num.positive(),
  cropGrowth: num.positive(),
  treeCycle: num.positive(),
  animalCycle: num.positive(),
  witherEnabled: z.boolean(),
  witherWindowFactor: num.nonnegative(),
  coinYield: num.nonnegative(),
  xpGain: num.nonnegative(),
  buyCost: num.nonnegative(),
  plowCost: num.nonnegative(),
  farmCashEarnRate: num.nonnegative(),
  fuelRegenPerHour: num.nonnegative(),
  collectibleDropRate: num.nonnegative(),
  masteryGoal: num.positive(),
  offlineProgress: z.enum(['full', 'capped', 'paused']),
  offlineCapHours: num.nonnegative(),
  aiNeighborCount: int.nonnegative(),
  aiGiftsPerDay: num.nonnegative(),
  keepPlowedAfterHarvest: z.boolean(),
  startingCoins: num.nonnegative(),
  startingCash: num.nonnegative(),
  overrides: z.record(z.string(), override),
});

export const gameStateSchema = z
  .object({
    schemaVersion: int,
    rules,
    clock: z.object({ gameNow: num, realNow: num }),
    rng: int,
    nextId: int.nonnegative(),
    players: z.record(z.string(), player),
    farms: z.record(z.string(), farm),
    localPlayerId: id,
    homeFarmId: id,
  })
  .refine((s) => Object.hasOwn(s.players, s.localPlayerId), 'the local player is missing')
  .refine((s) => Object.hasOwn(s.farms, s.homeFarmId), 'the home farm is missing');

export function parseGameState(data: unknown): { ok: true; state: GameState } | { ok: false; error: string } {
  const result = gameStateSchema.safeParse(data);
  if (!result.success) return { ok: false, error: z.prettifyError(result.error) };
  // Optional override fields parse as `T | undefined`; the shapes are otherwise identical.
  return { ok: true, state: result.data as GameState };
}
