/**
 * The single place game state changes (PLAN.md principle 2):
 * applyCommand(state, envelope, realNow, content) -> new state + events, or a rejection.
 * Input state is never mutated. Same inputs always produce the same output.
 */
import type { Content } from '../content';
import type { Command, CommandEnvelope, CommandError, CommandErrorCode } from './commands';
import { cropStatus } from './crops';
import {
  cropGrowMs,
  cropHarvestCoins,
  cropPlantXp,
  cropSeedCost,
  decorationCost,
  decorationRefund,
  decorationXp,
  plowCost,
  plowXp,
} from './economy';
import type { GameEvent } from './events';
import { entityAt, itemSize, placementProblem } from './grid';
import { allocateId, lookup } from './ids';
import { gainXp } from './progression';
import { validateRules } from './rules';
import type { WorldRules } from './rules';
import type { FarmState, GameState, PlayerState, PlotEntity } from './state';
import { advanceClock } from './time';

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; error: CommandError };

class Rejection extends Error {
  readonly code: CommandErrorCode;
  constructor(code: CommandErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function reject(code: CommandErrorCode, message: string): never {
  throw new Rejection(code, message);
}

interface Ctx {
  state: GameState;
  farm: FarmState;
  player: PlayerState;
  rules: WorldRules;
  content: Content;
  now: number;
  events: GameEvent[];
}

/**
 * Applies one command at real time `realNow`. On success the returned state has
 * its clock advanced and the command applied. On rejection the original state is
 * returned unchanged.
 */
export function applyCommand(
  state: GameState,
  envelope: CommandEnvelope,
  realNow: number,
  content: Content,
): ApplyResult {
  const next = structuredClone(state);
  advanceClock(next.clock, realNow, next.rules);
  const events: GameEvent[] = [];
  try {
    const player = lookup(next.players, envelope.playerId) ?? reject('unknown_player', 'No such player.');
    const farm = lookup(next.farms, envelope.farmId) ?? reject('unknown_farm', 'No such farm.');
    if (!canAct(farm, player)) reject('not_allowed', 'You can only change your own farm.');
    execute(envelope.command, { state: next, farm, player, rules: next.rules, content, now: next.clock.gameNow, events });
    return { ok: true, state: next, events };
  } catch (e) {
    if (e instanceof Rejection) return { ok: false, state, error: { code: e.code, message: e.message } };
    throw e;
  }
}

/** Advances time without a command (called by the game loop and on resume). */
export function tick(state: GameState, realNow: number): GameState {
  if (realNow <= state.clock.realNow) return state;
  const next = { ...state, clock: { ...state.clock } };
  advanceClock(next.clock, realNow, next.rules);
  return next;
}

/** Co-op seam: who may act on a farm. Single-player: only its owner. */
function canAct(farm: FarmState, player: PlayerState): boolean {
  return farm.ownerId === player.id;
}

function execute(command: Command, ctx: Ctx): void {
  switch (command.type) {
    case 'plow':
      return plow(ctx, tile(command.x, command.y));
    case 'plant':
      return plant(ctx, tile(command.x, command.y), command.cropId);
    case 'harvest':
      return harvest(ctx, tile(command.x, command.y));
    case 'buy':
      return buy(ctx, command.itemId, tile(command.x, command.y), command.rotated ?? false);
    case 'sell':
      return sell(ctx, command.entityId);
    case 'move':
      return move(ctx, command.entityId, tile(command.x, command.y), command.rotated);
    case 'setRules':
      return setRules(ctx, command.rules);
    default:
      reject('invalid', `Unknown command type "${(command as { type?: unknown }).type}".`);
  }
}

function tile(x: unknown, y: unknown): { x: number; y: number } {
  if (!Number.isInteger(x) || !Number.isInteger(y)) reject('invalid', 'Tile coordinates must be integers.');
  return { x: x as number, y: y as number };
}

function spend(ctx: Ctx, amount: number): void {
  if (ctx.player.coins < amount) reject('insufficient_coins', `Needs ${amount} coins.`);
  ctx.player.coins -= amount;
}

function plotAt(ctx: Ctx, at: { x: number; y: number }): PlotEntity {
  if (at.x < 0 || at.y < 0 || at.x >= ctx.farm.width || at.y >= ctx.farm.height) {
    reject('out_of_bounds', 'That spot is outside the farm.');
  }
  const entity = entityAt(ctx.farm, at.x, at.y, ctx.content);
  if (!entity) reject('not_plowed', 'Plow this spot first.');
  if (entity.kind !== 'plot') reject('occupied', 'Something is already here.');
  return entity;
}

/** Plow grass into a new plot, re-plow a fallow plot, or plow over withered crops. */
function plow(ctx: Ctx, at: { x: number; y: number }): void {
  const { farm, content, rules } = ctx;
  if (at.x < 0 || at.y < 0 || at.x >= farm.width || at.y >= farm.height) {
    reject('out_of_bounds', 'That spot is outside the farm.');
  }
  const existing = entityAt(farm, at.x, at.y, content);
  let plot: PlotEntity;
  if (!existing) {
    plot = { kind: 'plot', id: '', ownerId: ctx.player.id, x: at.x, y: at.y, plowed: false, crop: null };
  } else if (existing.kind !== 'plot') {
    reject('occupied', 'Something is already here.');
  } else {
    plot = existing;
    if (plot.crop && cropStatus(plot.crop, ctx.now, rules) !== 'withered') reject('occupied', 'A crop is growing here.');
    if (!plot.crop && plot.plowed) reject('already_plowed', 'This plot is already plowed.');
  }

  const cost = plowCost(content, rules);
  spend(ctx, cost);
  if (!existing) {
    plot.id = allocateId(ctx.state, 'plot');
    farm.entities[plot.id] = plot;
  }
  plot.plowed = true;
  plot.crop = null;
  ctx.player.stats.plowed += 1;
  ctx.events.push({ type: 'plowed', x: at.x, y: at.y, entityId: plot.id, cost });
  gainXp(ctx.player, plowXp(content, rules), content.levels, rules, ctx.events);
}

function plant(ctx: Ctx, at: { x: number; y: number }, cropId: string): void {
  const { content, rules, player } = ctx;
  const crop = lookup(content.crops, cropId) ?? reject('unknown_item', `Unknown crop "${cropId}".`);
  if (player.level < crop.unlockLevel) reject('locked', `${crop.name} unlocks at level ${crop.unlockLevel}.`);
  const plot = plotAt(ctx, at);
  if (plot.crop) reject('occupied', 'Something is already planted here.');
  if (!plot.plowed) reject('not_plowed', 'Plow this plot first.');

  const cost = cropSeedCost(crop, rules);
  spend(ctx, cost);
  plot.crop = { cropId, plantedAt: ctx.now, readyAt: ctx.now + cropGrowMs(crop, rules) };
  ctx.events.push({ type: 'planted', x: at.x, y: at.y, entityId: plot.id, cropId, cost });
  gainXp(player, cropPlantXp(crop, rules), content.levels, rules, ctx.events);
}

function harvest(ctx: Ctx, at: { x: number; y: number }): void {
  const { content, rules, player } = ctx;
  const plot = plotAt(ctx, at);
  if (!plot.crop) reject('no_crop', 'Nothing is planted here.');
  const status = cropStatus(plot.crop, ctx.now, rules);
  if (status === 'growing') reject('not_ripe', 'This crop is not ready yet.');
  if (status === 'withered') reject('withered', 'This crop has withered. Plow over it to clear it.');

  const { cropId } = plot.crop;
  const crop = lookup(content.crops, cropId);
  const coins = crop ? cropHarvestCoins(crop, rules) : 0; // a crop removed from content still clears
  player.coins += coins;
  player.stats.harvested[cropId] = (lookup(player.stats.harvested, cropId) ?? 0) + 1;
  plot.crop = null;
  plot.plowed = rules.keepPlowedAfterHarvest;
  ctx.events.push({ type: 'harvested', x: at.x, y: at.y, entityId: plot.id, cropId, coins });
}

function buy(ctx: Ctx, itemId: string, at: { x: number; y: number }, rotated: boolean): void {
  const { content, rules, player, farm } = ctx;
  const item = lookup(content.decorations, itemId) ?? reject('unknown_item', `Unknown item "${itemId}".`);
  if (player.level < item.unlockLevel) reject('locked', `${item.name} unlocks at level ${item.unlockLevel}.`);
  const size = itemSize(itemId, rotated, content) ?? reject('unknown_item', `Unknown item "${itemId}".`);
  const problem = placementProblem(farm, { ...at, ...size }, content);
  if (problem) reject(problem, problem === 'occupied' ? 'Something is in the way.' : 'That does not fit on the farm.');

  const cost = decorationCost(item, rules);
  spend(ctx, cost);
  const id = allocateId(ctx.state, 'deco');
  farm.entities[id] = { kind: 'decoration', id, ownerId: player.id, x: at.x, y: at.y, itemId, rotated };
  ctx.events.push({ type: 'placed', entityId: id, itemId, cost });
  gainXp(player, decorationXp(item, rules), content.levels, rules, ctx.events);
}

/** Removes an entity. Decorations refund part of their price; plots (and their crops) refund nothing. */
function sell(ctx: Ctx, entityId: string): void {
  const { farm, content, rules, player } = ctx;
  const entity = lookup(farm.entities, entityId) ?? reject('unknown_entity', 'That item is not on this farm.');
  let refund = 0;
  if (entity.kind === 'decoration') {
    const item = lookup(content.decorations, entity.itemId);
    refund = item ? decorationRefund(item, content, rules) : 0;
  }
  player.coins += refund;
  delete farm.entities[entityId];
  ctx.events.push({ type: 'sold', entityId, refund });
}

/**
 * Replaces the world rules (PLAN.md section 5). The clock was already advanced
 * under the old rules, so a timeScale change only affects time from now on.
 * Grow times are fixed at planting, so growth changes only affect new plantings.
 * Withering follows the current rules, but a change must never wither a ripe crop
 * on the spot: crops that were ripe and would now count as withered get a fresh
 * ripe window starting now.
 */
function setRules(ctx: Ctx, input: unknown): void {
  const result = validateRules(input);
  if (!result.ok) reject('invalid', result.error);
  const before = ctx.state.rules;
  const after = result.rules;
  let refreshed = 0;

  for (const farm of Object.values(ctx.state.farms)) {
    for (const entity of Object.values(farm.entities)) {
      if (entity.kind !== 'plot' || !entity.crop) continue;
      const crop = entity.crop;
      if (cropStatus(crop, ctx.now, before) === 'ripe' && cropStatus(crop, ctx.now, after) === 'withered') {
        const shift = ctx.now - crop.readyAt; // keeps the grow time, so the window length is unchanged
        crop.plantedAt += shift;
        crop.readyAt += shift;
        refreshed++;
      }
    }
  }

  ctx.state.rules = after;
  ctx.events.push({ type: 'rulesChanged', refreshed });
}

function move(ctx: Ctx, entityId: string, at: { x: number; y: number }, rotated: boolean | undefined): void {
  const { farm, content } = ctx;
  const entity = lookup(farm.entities, entityId) ?? reject('unknown_entity', 'That item is not on this farm.');
  const newRotated = entity.kind === 'decoration' ? (rotated ?? entity.rotated) : false;
  const size = entity.kind === 'decoration' ? itemSize(entity.itemId, newRotated, content) ?? { w: 1, h: 1 } : { w: 1, h: 1 };
  const problem = placementProblem(farm, { ...at, ...size }, content, entityId);
  if (problem) reject(problem, problem === 'occupied' ? 'Something is in the way.' : 'That does not fit on the farm.');

  entity.x = at.x;
  entity.y = at.y;
  if (entity.kind === 'decoration') entity.rotated = newRotated;
  ctx.events.push({ type: 'moved', entityId, x: at.x, y: at.y, rotated: newRotated });
}
