/**
 * World rules: every tunable rate in the game (PLAN.md section 5). Stored inside
 * each save, so a future co-op host's rules apply to everyone on that farm.
 */

export type PresetId = 'classic' | 'relaxed' | 'idle' | 'speedrun';
export type OfflineProgress = 'full' | 'capped' | 'paused';

/** Per-item replacements for an item's base stats. Global multipliers still apply on top. */
export interface ItemOverride {
  growMs?: number;
  sellPrice?: number;
  cost?: number;
  xp?: number;
}

export interface WorldRules {
  preset: PresetId | 'custom';
  /** 1 = real time; 60 = one real minute is one game hour. */
  timeScale: number;
  /** Multiplier on crop grow time (0.5 = twice as fast). */
  cropGrowth: number;
  /** Multiplier on tree harvest cycles (Phase 5). */
  treeCycle: number;
  /** Multiplier on animal harvest cycles (Phase 5). */
  animalCycle: number;
  witherEnabled: boolean;
  /** How long a crop stays ripe before withering, as a fraction of its grow time. */
  witherWindowFactor: number;
  /** Multiplier on coins earned from harvests. */
  coinYield: number;
  /** Multiplier on all XP earned. */
  xpGain: number;
  /** Multiplier on every purchase price (seeds, decorations, ...). */
  buyCost: number;
  /** Multiplier on the plow fee. */
  plowCost: number;
  /** Multiplier on Farm Cash rewards. */
  farmCashEarnRate: number;
  fuelRegenPerHour: number;
  collectibleDropRate: number;
  /** What happens to timers while the game is closed or in the background. */
  offlineProgress: OfflineProgress;
  /** With offlineProgress 'capped': most real hours of absence that count. */
  offlineCapHours: number;
  aiNeighborCount: number;
  aiGiftsPerDay: number;
  /** FV1 leaves plots fallow after harvest (needing a new plow); true skips that. */
  keepPlowedAfterHarvest: boolean;
  startingCoins: number;
  startingCash: number;
  overrides: Record<string, ItemOverride>;
}

const CLASSIC: WorldRules = {
  preset: 'classic',
  timeScale: 1,
  cropGrowth: 1,
  treeCycle: 1,
  animalCycle: 1,
  witherEnabled: true,
  witherWindowFactor: 1,
  coinYield: 1,
  xpGain: 1,
  buyCost: 1,
  plowCost: 1,
  farmCashEarnRate: 1,
  fuelRegenPerHour: 1,
  collectibleDropRate: 1,
  offlineProgress: 'full',
  offlineCapHours: 24,
  aiNeighborCount: 5,
  aiGiftsPerDay: 3,
  keepPlowedAfterHarvest: false,
  startingCoins: 200,
  startingCash: 5,
  overrides: {},
};

const PRESETS: Record<PresetId, WorldRules> = {
  classic: CLASSIC,
  relaxed: { ...CLASSIC, preset: 'relaxed', witherEnabled: false, coinYield: 2 },
  idle: { ...CLASSIC, preset: 'idle', witherEnabled: false, cropGrowth: 0.5, offlineProgress: 'paused' },
  speedrun: { ...CLASSIC, preset: 'speedrun', timeScale: 600, xpGain: 5, startingCoins: 1000 },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/** A fresh copy of a preset's rules (safe to mutate). */
export function rulesForPreset(preset: PresetId): WorldRules {
  return structuredClone(PRESETS[preset]);
}

export const DEFAULT_PRESET: PresetId = 'classic';
