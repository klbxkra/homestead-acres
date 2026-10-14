import type { Content } from '../content';
import { cropStatus, lookup } from '../core';
import type { GameState } from '../core';

export interface AwaySummary {
  farmName: string;
  /** Real time since the save was written. */
  awayMs: number;
  /** Game time credited for the absence (after timeScale and offline rules). */
  creditedGameMs: number;
  ripened: number;
  withered: number;
  /** Crop name -> how many became ripe. */
  ripenedByCrop: Record<string, number>;
  timersPaused: boolean;
}

/** What changed on the farm between the saved state and the caught-up state. */
export function summarizeAway(before: GameState, after: GameState, realNow: number, content: Content): AwaySummary {
  const farmBefore = before.farms[before.homeFarmId]!;
  const farmAfter = after.farms[after.homeFarmId]!;
  let ripened = 0;
  let withered = 0;
  const ripenedByCrop: Record<string, number> = {};

  for (const entity of Object.values(farmAfter.entities)) {
    if (entity.kind !== 'plot' || !entity.crop) continue;
    const old = lookup(farmBefore.entities, entity.id);
    if (old?.kind !== 'plot' || !old.crop) continue;
    const was = cropStatus(old.crop, before.clock.gameNow, before.rules);
    const now = cropStatus(entity.crop, after.clock.gameNow, after.rules);
    if (was === now) continue;
    if (now === 'ripe') {
      ripened++;
      const name = lookup(content.crops, entity.crop.cropId)?.name ?? entity.crop.cropId;
      ripenedByCrop[name] = (ripenedByCrop[name] ?? 0) + 1;
    } else if (now === 'withered') {
      withered++;
    }
  }

  return {
    farmName: farmAfter.name,
    awayMs: Math.max(0, realNow - before.clock.realNow),
    creditedGameMs: after.clock.gameNow - before.clock.gameNow,
    ripened,
    withered,
    ripenedByCrop,
    timersPaused: after.rules.offlineProgress === 'paused',
  };
}

/** Worth a "welcome back" popup? */
export function isNoteworthy(s: AwaySummary): boolean {
  return s.awayMs >= 60_000 && (s.ripened > 0 || s.withered > 0 || s.awayMs >= 10 * 60_000);
}
