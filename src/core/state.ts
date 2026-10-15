import type { Content } from '../content';
import { allocateId } from './ids';
import type { EntityId, FarmId, PlayerId } from './ids';
import { rulesForPreset, DEFAULT_PRESET } from './rules';
import type { WorldRules } from './rules';
import { seedFromString } from './rng';

/** Bump with a step in persistence/migrations.ts whenever GameState changes shape. */
export const SCHEMA_VERSION = 2;

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

/** Trees and animals produce on a cycle; readyAt is fixed when the cycle starts. They never wither. */
export interface TreeEntity extends EntityBase {
  kind: 'tree';
  itemId: string;
  readyAt: number;
}

export interface AnimalEntity extends EntityBase {
  kind: 'animal';
  itemId: string;
  readyAt: number;
}

export interface HousedAnimal {
  itemId: string;
  readyAt: number;
}

export interface BuildingEntity extends EntityBase {
  kind: 'building';
  itemId: string;
  rotated: boolean;
  /** Animals living inside (coops, dairies, pens). Collected all at once. */
  housed: HousedAnimal[];
}

export type Entity = PlotEntity | DecorationEntity | TreeEntity | AnimalEntity | BuildingEntity;
/** Entities that come from the item catalogue (everything except plots). */
export type ItemEntity = DecorationEntity | TreeEntity | AnimalEntity | BuildingEntity;

export interface FarmState {
  id: FarmId;
  ownerId: PlayerId;
  name: string;
  width: number;
  height: number;
  entities: Record<EntityId, Entity>;
}

export interface PlayerStats {
  /** Crop id -> times harvested (drives mastery). */
  harvested: Record<string, number>;
  /** Named counters that drive ribbons: plowed, cropsHarvested, coinsEarned, ... */
  counters: Record<string, number>;
}

/** Fuel regenerates over game time; stored as a value at a moment and computed lazily. */
export interface FuelState {
  amount: number;
  updatedAt: number;
}

export interface DailyBonusState {
  /** Real (wall-clock) ms of the last claim; streaks use real days even at high game speed. */
  lastClaimRealAt: number | null;
  streak: number;
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
  /** Crop id -> mastery stars already rewarded (0-3). */
  masteryStars: Record<string, number>;
  /** Ribbon id -> tier reached (0-4). */
  ribbons: Record<string, number>;
  /** Collectible id -> count. */
  collectibles: Record<string, number>;
  /** Rewards and gifts waiting to be placed. Unlimited. */
  giftBox: Record<string, number>;
  /** Items put away from the farm. Limited by storage capacity. */
  storage: Record<string, number>;
  fuel: FuelState;
  /** Owned vehicle ids. */
  vehicles: string[];
  daily: DailyBonusState;
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
        stats: { harvested: {}, counters: {} },
        masteryStars: {},
        ribbons: {},
        collectibles: {},
        giftBox: {},
        storage: {},
        fuel: { amount: content.base.fuelMax, updatedAt: options.realNow },
        vehicles: [],
        daily: { lastClaimRealAt: null, streak: 0 },
      },
    },
    farms: {
      [farmId]: { id: farmId, ownerId: playerId, name: options.farmName, width: size, height: size, entities: {} },
    },
    localPlayerId: playerId,
    homeFarmId: farmId,
  };
}
