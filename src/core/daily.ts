/**
 * Daily login bonus and farm expansion (PLAN.md section 4.7). The daily bonus
 * uses real (wall-clock) time from the clock, so a fast game speed doesn't make
 * days go by faster.
 */
import type { Content } from '../content';
import { reject, spend } from './context';
import type { Ctx } from './context';
import { expansionCost } from './economy';
import { grantReward } from './rewards';
import type { PlayerState } from './state';
import { HOUR_MS } from './time';

export interface DailyStatus {
  available: boolean;
  /** Real ms until it can be claimed (0 when available). */
  waitMs: number;
  /** Streak day the next claim would count as (1 = streak restarts). */
  nextStreak: number;
}

export function dailyStatus(player: PlayerState, realNow: number, content: Content): DailyStatus {
  const d = content.base.dailyBonus;
  const last = player.daily.lastClaimRealAt;
  if (last === null) return { available: true, waitMs: 0, nextStreak: 1 };
  const since = realNow - last;
  const wait = Math.max(0, d.cooldownHours * HOUR_MS - since);
  const continues = since <= d.streakWindowHours * HOUR_MS;
  return { available: wait === 0, waitMs: wait, nextStreak: continues ? player.daily.streak + 1 : 1 };
}

export function claimDailyBonus(ctx: Ctx): void {
  const realNow = ctx.state.clock.realNow;
  const status = dailyStatus(ctx.player, realNow, ctx.content);
  if (!status.available) reject('not_ready', 'Today\'s bonus was already collected. Come back tomorrow!');
  const days = ctx.content.base.dailyBonus.days;
  const reward = days[Math.min(status.nextStreak, days.length) - 1]!;
  ctx.player.daily = { lastClaimRealAt: realNow, streak: status.nextStreak };
  ctx.events.push({ type: 'dailyBonus', streak: status.nextStreak, coins: reward.coins, xp: reward.xp * ctx.rules.xpGain, cash: reward.cash });
  grantReward(ctx, reward, 'gift');
}

/** The next farm size available, or null when the farm is as big as it gets. */
export function nextExpansion(content: Content, currentSize: number) {
  return content.expansions.find((e) => e.size > currentSize) ?? null;
}

export function expandFarm(ctx: Ctx): void {
  const next = nextExpansion(ctx.content, ctx.farm.width) ?? reject('max_size', 'Your farm is already as big as it gets.');
  if (ctx.player.level < next.unlockLevel) reject('locked', `The next expansion unlocks at level ${next.unlockLevel}.`);
  const cost = expansionCost(next, ctx.rules);
  spend(ctx, cost);
  ctx.farm.width = next.size;
  ctx.farm.height = next.size;
  ctx.events.push({ type: 'farmExpanded', size: next.size, cost });
}
