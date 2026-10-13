import type { Content } from '../content';
import { allocateId } from './ids';
import type { EntityId, FarmId, PlayerId } from './ids';
import { rulesForPreset, DEFAULT_PRESET } from './rules';
import type { WorldRules } from './rules';
import { seedFromString } from './rng';

export const SCHEMA_VERSION = 1;

export interface Clock {
  /** Game-time ms. Starts equal to real time; runs faster with timeScale. All timers use this. */
  gameNow: number;
  /** Real (wall-clock) ms when gameNow was last advanced. Never moves backwards. */
  realNow: number;
}

export interface CropInstance {
  cropId: string;
  plantedAt: number;
  /** Game time the crop becomes ripe. Fixed at planting, so rule changes only affect new plantings. */
  readyAt: number;
}

interface EntityBase {
  id: EntityId;
  ownerId: PlayerId;
  /** Top corner of the footprint, in plot units. */
  x: number;
  y: number;
}

export interface PlotEntity extends EntityBase {
  kind: 'plot';
  /** Fallow plots (after a harvest) must be plowed again before planting. */
  plowed: boolean;
  crop: CropInstance | null;
}

export interface DecorationEntity extends EntityBase {
  kind: 'decoration';
  itemId: string;
  /** Swaps the item's width and height. */
  rotated: boolean;
}

export type Entity = PlotEntity | DecorationEntity;

export interface FarmState {
  id: FarmId;
  ownerId: PlayerId;
  name: string;
  width: number;
  height: number;
  entities: Record<EntityId, Entity>;
}

export interface PlayerStats {
  harvested: Record<string, number>;
  plowed: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  coins: number;
  cash: number;
  /** May be fractional when xpGain is not a whole number; shown floored. */
  xp: number;
  level: number;
  stats: PlayerStats;
}

export interface GameState {
  schemaVersion: number;
  rules: WorldRules;
  clock: Clock;
  /** Seeded RNG state (see rng.ts). */
  rng: number;
  nextId: number;
  players: Record<PlayerId, PlayerState>;
  farms: Record<FarmId, FarmState>;
  /** The local player's id and home farm (single-player: the only ones). */
  localPlayerId: PlayerId;
  homeFarmId: FarmId;
}

export interface NewGameOptions {
  farmName: string;
  playerName: string;
  realNow: number;
  rules?: WorldRules;
  seed?: number;
}

export function newGame(options: NewGameOptions, content: Content): GameState {
  const rules = options.rules ? structuredClone(options.rules) : rulesForPreset(DEFAULT_PRESET);
  const counter = { nextId: 1 };
  const playerId = allocateId(counter, 'player');
  const farmId = allocateId(counter, 'farm');
  const size = content.base.startFarmSize;

  return {
    schemaVersion: SCHEMA_VERSION,
    rules,
    clock: { gameNow: options.realNow, realNow: options.realNow },
    rng: options.seed ?? seedFromString(`${options.farmName}:${options.realNow}`),
    nextId: counter.nextId,
    players: {
      [playerId]: {
        id: playerId,
        name: options.playerName,
        coins: rules.startingCoins,
        cash: rules.startingCash,
        xp: 0,
        level: 1,
        stats: { harvested: {}, plowed: 0 },
      },
    },
    farms: {
      [farmId]: { id: farmId, ownerId: playerId, name: options.farmName, width: size, height: size, entities: {} },
    },
    localPlayerId: playerId,
    homeFarmId: farmId,
  };
}
