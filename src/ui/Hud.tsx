import type { ComponentChildren } from 'preact';
import type { Session } from '../app/session';
import { GAME_TITLE } from '../config';
import { maxLevel, xpForLevel } from '../core';
import { formatNumber } from './format';
import { useGameState } from './hooks';

export function Hud({ session, menu }: { session: Session; menu?: ComponentChildren }) {
  const state = useGameState(session.transport);
  const player = state.players[state.localPlayerId]!;
  const levels = session.transport.content.levels;

  const atMax = player.level >= maxLevel(levels);
  const floor = xpForLevel(player.level, levels) ?? 0;
  const next = xpForLevel(player.level + 1, levels) ?? floor;
  const progress = atMax ? 1 : (player.xp - floor) / Math.max(1, next - floor);

  return (
    <div class="hud-top">
      {menu}
      <div class="hud-chip hud-title">{GAME_TITLE}</div>
      <div class="hud-chip hud-level interactive" title={atMax ? 'Max level' : `${formatNumber(player.xp)} / ${formatNumber(next)} XP`}>
        <span class="level-badge">{player.level}</span>
        <div class="xp-bar" aria-label="Experience">
          <div class="xp-fill" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
          <span class="xp-text">{atMax ? 'MAX' : `${formatNumber(player.xp)} / ${formatNumber(next)}`}</span>
        </div>
      </div>
      <div class="hud-chip interactive" title="Coins">
        🪙 <span>{formatNumber(player.coins)}</span>
      </div>
      <div class="hud-chip interactive" title="Farm Cash">
        💵 <span>{formatNumber(player.cash)}</span>
      </div>
      {state.rules.timeScale !== 1 && (
        <div class="hud-chip hud-speed" title="Time runs faster than real time (World Rules)">
          ⏩ ×{state.rules.timeScale}
        </div>
      )}
    </div>
  );
}
