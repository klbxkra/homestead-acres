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

/** Which preset (if any) these rules match exactly, ignoring the preset label and the new-farm-only fields. */
export function matchingPreset(rules: WorldRules): PresetId | null {
  const strip = (r: WorldRules) => ({ ...r, preset: null, startingCoins: null, startingCash: null });
  const target = JSON.stringify(strip(rules));
  return PRESET_IDS.find((id) => JSON.stringify(strip(PRESETS[id])) === target) ?? null;
}

// ---------------------------------------------------------------- validation

type NumericRuleKey = {
  [K in keyof WorldRules]: WorldRules[K] extends number ? K : never;
}[keyof WorldRules];

/** Allowed range for every numeric rule. Shared by the rules editor, rules import and the setRules command. */
export const RULE_LIMITS: Record<NumericRuleKey, { min: number; max: number; integer?: boolean }> = {
  timeScale: { min: 0.1, max: 10_000 },
  cropGrowth: { min: 0.01, max: 100 },
  treeCycle: { min: 0.01, max: 100 },
  animalCycle: { min: 0.01, max: 100 },
  witherWindowFactor: { min: 0.05, max: 100 },
  coinYield: { min: 0, max: 100 },
  xpGain: { min: 0, max: 100 },
  buyCost: { min: 0, max: 100 },
  plowCost: { min: 0, max: 100 },
  farmCashEarnRate: { min: 0, max: 100 },
  fuelRegenPerHour: { min: 0, max: 1000 },
  collectibleDropRate: { min: 0, max: 100 },
  offlineCapHours: { min: 0, max: 24 * 365 },
  aiNeighborCount: { min: 0, max: 20, integer: true },
  aiGiftsPerDay: { min: 0, max: 100 },
  startingCoins: { min: 0, max: 1_000_000_000, integer: true },
  startingCash: { min: 0, max: 1_000_000, integer: true },
};

export const OVERRIDE_LIMITS: Record<keyof ItemOverride, { min: number; max: number }> = {
  growMs: { min: 1000, max: 365 * 24 * 60 * 60 * 1000 },
  sellPrice: { min: 0, max: 1_000_000_000 },
  cost: { min: 0, max: 1_000_000_000 },
  xp: { min: 0, max: 1_000_000 },
};

const BOOLEAN_KEYS = ['witherEnabled', 'keepPlowedAfterHarvest'] as const satisfies readonly (keyof WorldRules)[];
const OFFLINE_MODES: readonly OfflineProgress[] = ['full', 'capped', 'paused'];
const PRESET_LABELS: readonly WorldRules['preset'][] = ['classic', 'relaxed', 'idle', 'speedrun', 'custom'];
const MAX_OVERRIDES = 1000;

export type RulesValidation = { ok: true; rules: WorldRules } | { ok: false; error: string };

/**
 * Checks untrusted rules (from the editor, an imported rules file, or a co-op
 * client) and returns a clean copy with only known keys. Never throws.
 */
export function validateRules(input: unknown): RulesValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, error: 'Rules must be an object.' };
  const raw = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const preset = raw['preset'];
  if (!PRESET_LABELS.includes(preset as WorldRules['preset'])) return { ok: false, error: `Unknown preset "${String(preset)}".` };
  out['preset'] = preset;

  for (const [key, limit] of Object.entries(RULE_LIMITS)) {
    const v = raw[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: `${key} must be a number.` };
    if (v < limit.min || v > limit.max) return { ok: false, error: `${key} must be between ${limit.min} and ${limit.max}.` };
    if (limit.integer && !Number.isInteger(v)) return { ok: false, error: `${key} must be a whole number.` };
    out[key] = v;
  }

  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] !== 'boolean') return { ok: false, error: `${key} must be true or false.` };
    out[key] = raw[key];
  }

  if (!OFFLINE_MODES.includes(raw['offlineProgress'] as OfflineProgress)) return { ok: false, error: 'offlineProgress must be full, capped or paused.' };
  out['offlineProgress'] = raw['offlineProgress'];

  const overrides = raw['overrides'] ?? {};
  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) return { ok: false, error: 'overrides must be an object.' };
  const entries = Object.entries(overrides as Record<string, unknown>);
  if (entries.length > MAX_OVERRIDES) return { ok: false, error: 'Too many item overrides.' };
  const cleanOverrides: Record<string, ItemOverride> = {};
  for (const [itemId, ov] of entries) {
    if (itemId === '__proto__' || itemId === 'constructor' || itemId === 'prototype') return { ok: false, error: `Invalid item id "${itemId}".` };
    if (typeof ov !== 'object' || ov === null || Array.isArray(ov)) return { ok: false, error: `Override for ${itemId} must be an object.` };
    const clean: ItemOverride = {};
    for (const [field, limit] of Object.entries(OVERRIDE_LIMITS) as [keyof ItemOverride, { min: number; max: number }][]) {
      const v = (ov as Record<string, unknown>)[field];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < limit.min || v > limit.max) {
        return { ok: false, error: `Override ${itemId}.${field} must be between ${limit.min} and ${limit.max}.` };
      }
      clean[field] = v;
    }
    if (Object.keys(clean).length > 0) cleanOverrides[itemId] = clean;
  }
  out['overrides'] = cleanOverrides;

  return { ok: true, rules: out as unknown as WorldRules };
}
