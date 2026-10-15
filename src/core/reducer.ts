/**
 * The single place game state changes (PLAN.md principle 2):
 * applyCommand(state, envelope, realNow, content) -> new state + events, or a rejection.
 * Input state is never mutated. Same inputs always produce the same output.
 * Command handlers live in fieldwork / production / items / rewards / vehicles / daily.
 */
import type { Content } from '../content';
import type { Command, CommandEnvelope, CommandError } from './commands';
import { reject, Rejection, tile } from './context';
import type { Ctx } from './context';
import { cropStatus } from './crops';
import { claimDailyBonus, expandFarm } from './daily';
import type { GameEvent } from './events';
import { plant, plow } from './fieldwork';
import { lookup } from './ids';
import { buy, move, placeFromInventory, sellEntity, sellFromInventory, store } from './items';
import { harvestAt } from './production';
import { turnInCollection } from './rewards';
import { validateRules } from './rules';
import type { FarmState, GameState, PlayerState } from './state';
import { advanceClock } from './time';
import { buyVehicle, refuel, useVehicle } from './vehicles';

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; error: CommandError };

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
      return harvestAt(ctx, tile(command.x, command.y));
    case 'buy':
      return buy(ctx, command.itemId, tile(command.x, command.y), command.rotated ?? false);
    case 'sell':
      return sellEntity(ctx, command.entityId);
    case 'move':
      return move(ctx, command.entityId, tile(command.x, command.y), command.rotated);
    case 'store':
      return store(ctx, command.entityId);
    case 'place':
      if (command.from !== 'giftBox' && command.from !== 'storage') reject('invalid', 'Unknown inventory.');
      return placeFromInventory(ctx, command.itemId, command.from, tile(command.x, command.y), command.rotated ?? false);
    case 'sellItem':
      if (command.from !== 'giftBox' && command.from !== 'storage') reject('invalid', 'Unknown inventory.');
      return sellFromInventory(ctx, command.itemId, command.from);
    case 'buyVehicle':
      return buyVehicle(ctx, command.vehicleId);
    case 'useVehicle':
      return useVehicle(ctx, command.vehicleId, tile(command.x, command.y), command.cropId);
    case 'refuel':
      return refuel(ctx);
    case 'expandFarm':
      return expandFarm(ctx);
    case 'turnInCollection':
      return turnInCollection(ctx, command.collectionId);
    case 'claimDailyBonus':
      return claimDailyBonus(ctx);
    case 'setRules':
      return setRules(ctx, command.rules);
    default:
      reject('invalid', `Unknown command type "${(command as { type?: unknown }).type}".`);
  }
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
