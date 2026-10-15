import { describe, expect, it } from 'vitest';
import { defaultContent } from '../../src/content';
import { gainXp, levelForXp, maxLevel, newGame, rulesForPreset, xpForLevel } from '../../src/core';
import type { GameEvent, PlayerState } from '../../src/core';

const levels = defaultContent.levels;

function freshPlayer(): PlayerState {
  const state = newGame({ farmName: 'F', playerName: 'P', realNow: 0, seed: 1, rules: { ...rulesForPreset('classic'), startingCash: 0 } }, defaultContent);
  return state.players[state.localPlayerId]!;
}

describe('levels', () => {
  it('maps XP to levels at the threshold boundaries', () => {
    expect(levelForXp(0, levels)).toBe(1);
    expect(levelForXp(14.9, levels)).toBe(1);
    expect(levelForXp(15, levels)).toBe(2);
    expect(levelForXp(54, levels)).toBe(2);
    expect(levelForXp(55, levels)).toBe(3);
  });

  it('caps at the top of the table', () => {
    expect(maxLevel(levels)).toBe(70);
    expect(levelForXp(10_000_000, levels)).toBe(70);
    expect(xpForLevel(70, levels)).toBe(levels.thresholds[69]);
    expect(xpForLevel(71, levels)).toBeNull();
  });
});

describe('gainXp', () => {
  it('levels up once per threshold crossed, with a cash reward each time', () => {
    const player = freshPlayer();
    const events: GameEvent[] = [];
    gainXp(player, 60, levels, rulesForPreset('classic'), events);
    expect(player.level).toBe(3);
    expect(player.cash).toBe(2);
    expect(events.filter((e) => e.type === 'levelUp').map((e) => (e.type === 'levelUp' ? e.level : 0))).toEqual([2, 3]);
  });

  it('scales the cash reward by farmCashEarnRate', () => {
    const player = freshPlayer();
    gainXp(player, 15, levels, { ...rulesForPreset('classic'), farmCashEarnRate: 3 }, []);
    expect(player.cash).toBe(3);
  });

  it('ignores zero or negative XP', () => {
    const player = freshPlayer();
    const events: GameEvent[] = [];
    gainXp(player, 0, levels, rulesForPreset('classic'), events);
    gainXp(player, -5, levels, rulesForPreset('classic'), events);
    expect(player.xp).toBe(0);
    expect(events).toEqual([]);
  });
});
