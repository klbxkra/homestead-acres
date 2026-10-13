import type { LevelsDef } from '../content';
import type { GameEvent } from './events';
import type { WorldRules } from './rules';
import type { PlayerState } from './state';

export function maxLevel(levels: LevelsDef): number {
  return levels.thresholds.length;
}

/** Level reached with this much XP (1-based, capped at the top of the table). */
export function levelForXp(xp: number, levels: LevelsDef): number {
  let level = 1;
  for (let i = 1; i < levels.thresholds.length; i++) {
    if (xp >= (levels.thresholds[i] ?? Infinity)) level = i + 1;
    else break;
  }
  return level;
}

/** Total XP needed to reach `level`, or null past the top of the table. */
export function xpForLevel(level: number, levels: LevelsDef): number | null {
  return levels.thresholds[level - 1] ?? null;
}

/** Adds XP, applies any level-ups (with their rewards) and records events. */
export function gainXp(
  player: PlayerState,
  amount: number,
  levels: LevelsDef,
  rules: WorldRules,
  events: GameEvent[],
): void {
  if (amount <= 0) return;
  player.xp += amount;
  events.push({ type: 'xpGained', playerId: player.id, amount });

  const reached = levelForXp(player.xp, levels);
  while (player.level < reached) {
    player.level += 1;
    const cashReward = Math.round(levels.cashPerLevel * rules.farmCashEarnRate);
    player.cash += cashReward;
    events.push({ type: 'levelUp', playerId: player.id, level: player.level, cashReward });
  }
}
