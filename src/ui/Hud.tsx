import type { ComponentChildren } from 'preact';
import type { Session } from '../app/session';
import { GAME_TITLE } from '../config';
import { toast } from '../app/uiState';
import { contractDef, contractStatus, contractTotal, fuelAt, fuelCapacity, maxLevel, refuelCost, xpForLevel } from '../core';
import { formatDuration, formatNumber } from './format';
import { useGameState } from './hooks';

/** Fuel gauge; tapping it offers a refill for Farm Cash. */
function FuelChip({ session }: { session: Session }) {
  const { transport, ui } = session;
  const state = useGameState(transport);
  const player = state.players[state.localPlayerId]!;
  const content = transport.content;
  const max = fuelCapacity(state.farms[state.homeFarmId]!, content);
  const fuel = fuelAt(player.fuel, state.clock.gameNow, state.rules, content, max);
  const cost = refuelCost(player.fuel, state.clock.gameNow, state.rules, content, max);
  const refill = () => {
    if (cost === 0) return toast(ui, 'The tank is full.', 'info');
    ui.set({
      confirm: {
        message: `Fill the fuel tank for ${cost} Farm Cash? (It also refills slowly by itself.)`,
        confirmLabel: 'Refuel',
        onConfirm: () => {
          const r = transport.send({ type: 'refuel' });
          if (!r.ok) toast(ui, r.error.message, 'error');
        },
      },
    });
  };
  return (
    <button type="button" class="hud-chip interactive hud-btn" title="Fuel (tap to refill)" onClick={refill}>
      ⛽ <span>{Math.floor(fuel)}/{max}</span>
    </button>
  );
}

/** The open co-op job at a glance; tap for the details. */
function JobChip({ session }: { session: Session }) {
  const { transport, ui } = session;
  const state = useGameState(transport);
  const job = state.players[state.localPlayerId]!.contract;
  const def = job ? contractDef(transport.content, job.contractId) : undefined;
  if (!job || !def) return null;
  const status = contractStatus(job, state.clock.gameNow);
  const done = def.goals.reduce((n, g) => n + Math.min(g.count, contractTotal(job, g.cropId)), 0);
  const total = def.goals.reduce((n, g) => n + g.count, 0);
  const label =
    status === 'complete' ? 'Claim reward!' : status === 'failed' ? 'Out of time' : `${Math.floor((done / total) * 100)}% · ${formatDuration((job.endsAt - state.clock.gameNow) / state.rules.timeScale)}`;
  return (
    <button
      type="button"
      class={`hud-chip interactive hud-btn hud-job ${status === 'complete' ? 'ready' : ''}`}
      title={`Co-op job: ${def.name}`}
      onClick={() => ui.set({ panel: 'neighbors', neighborsTab: 'jobs' })}
    >
      📋 <span>{label}</span>
    </button>
  );
}

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
      {player.vehicles.length > 0 && <FuelChip session={session} />}
      <JobChip session={session} />
      {state.rules.timeScale !== 1 && (
        <div class="hud-chip hud-speed" title="Time runs faster than real time (World Rules)">
          ⏩ ×{state.rules.timeScale}
        </div>
      )}
    </div>
  );
}
