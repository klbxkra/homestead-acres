/** Shared plumbing for command handlers: the mutable draft, rejections, payments and dice. */
import type { Content } from '../content';
import type { CommandErrorCode } from './commands';
import type { GameEvent } from './events';
import { chance, nextInt } from './rng';
import type { WorldRules } from './rules';
import type { FarmState, GameState, PlayerState } from './state';

export class Rejection extends Error {
  readonly code: CommandErrorCode;
  constructor(code: CommandErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Abort the command. Handlers validate before they mutate, so a rejection leaves the draft clean. */
export function reject(code: CommandErrorCode, message: string): never {
  throw new Rejection(code, message);
}

/** A command being applied: a draft copy of state that handlers mutate directly. */
export interface Ctx {
  state: GameState;
  farm: FarmState;
  player: PlayerState;
  rules: WorldRules;
  content: Content;
  /** Game time. */
  now: number;
  events: GameEvent[];
}

export interface Tile {
  x: number;
  y: number;
}

export function tile(x: unknown, y: unknown): Tile {
  if (!Number.isInteger(x) || !Number.isInteger(y)) reject('invalid', 'Tile coordinates must be integers.');
  return { x: x as number, y: y as number };
}

export function inBounds(ctx: Ctx, at: Tile): boolean {
  return at.x >= 0 && at.y >= 0 && at.x < ctx.farm.width && at.y < ctx.farm.height;
}

export function spend(ctx: Ctx, coins: number): void {
  if (ctx.player.coins < coins) reject('insufficient_coins', `Needs ${coins.toLocaleString('en-US')} coins.`);
  ctx.player.coins -= coins;
}

export function spendCash(ctx: Ctx, cash: number): void {
  if (ctx.player.cash < cash) reject('insufficient_cash', `Needs ${cash} Farm Cash.`);
  ctx.player.cash -= cash;
}

/** Seeded dice: true with probability p. Advances the RNG stored in state. */
export function roll(ctx: Ctx, p: number): boolean {
  if (p <= 0) return false;
  const r = chance(ctx.state.rng, p);
  ctx.state.rng = r.state;
  return r.value;
}

/** Seeded integer in [0, n). */
export function pickIndex(ctx: Ctx, n: number): number {
  const r = nextInt(ctx.state.rng, 0, n - 1);
  ctx.state.rng = r.state;
  return r.value;
}

/** Adds to a Record<string, number> counter map. */
export function bump(map: Record<string, number>, key: string, by = 1): number {
  map[key] = (Object.hasOwn(map, key) ? map[key]! : 0) + by;
  return map[key]!;
}
