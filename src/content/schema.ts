import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lower_snake_case');
const coins = z.number().int().nonnegative();
const level = z.number().int().min(1);
const hours = z.number().positive();
const size = z.number().int().min(1).max(6);

export const cropSchema = z.object({
  id,
  name: z.string().min(1),
  growHours: hours,
  cost: coins,
  sellPrice: coins,
  xp: z.number().nonnegative(),
  unlockLevel: level,
  /** Harvests needed for mastery stars 1-3; defaults from base.mastery by grow time. */
  mastery: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]).optional(),
});

export const decorationSchema = z.object({
  id,
  name: z.string().min(1),
  cost: coins,
  xp: z.number().nonnegative(),
  width: size,
  height: size,
  unlockLevel: level,
  /** false = reward-only (mastery, collections); not sold in the market. */
  buyable: z.boolean().default(true),
});

export const treeSchema = z.object({
  id,
  name: z.string().min(1),
  cost: coins,
  xp: z.number().nonnegative(),
  cycleHours: hours,
  yield: coins,
  unlockLevel: level,
});

export const animalSchema = treeSchema.extend({ product: z.string().min(1) });

export const buildingSchema = z
  .object({
    id,
    name: z.string().min(1),
    cost: coins,
    xp: z.number().nonnegative(),
    width: size,
    height: size,
    unlockLevel: level,
    /** Animal ids this building can house. */
    houses: z.array(id).default([]),
    capacity: z.number().int().nonnegative().default(0),
    /** Extra storage slots while placed on the farm. */
    storage: z.number().int().nonnegative().default(0),
  })
  .refine((b) => b.houses.length === 0 || b.capacity > 0, 'housing buildings need a capacity');

export const vehicleSchema = z.object({
  id,
  name: z.string().min(1),
  cost: coins,
  unlockLevel: level,
  actions: z.array(z.enum(['harvest', 'plow', 'plant'])).min(1),
  /** Works on an area x area square of plots. */
  area: z.number().int().min(1).max(5),
  fuelPerUse: z.number().int().min(0),
});

export const expansionSchema = z.object({ size: z.number().int().min(4).max(100), unlockLevel: level, cost: coins });

export const ribbonSchema = z.object({
  id,
  name: z.string().min(1),
  counter: z.string().min(1),
  description: z.string(),
  tiers: z.array(z.number().positive()).length(4),
});

const rewardSchema = z.object({
  coins: coins.default(0),
  xp: z.number().nonnegative().default(0),
  cash: coins.default(0),
  itemId: id.optional(),
});

export const collectionSchema = z.object({
  id,
  name: z.string().min(1),
  items: z.array(z.object({ id, name: z.string().min(1) })).min(2),
  sources: z.object({
    crops: z.array(id).default([]),
    trees: z.boolean().default(false),
    animals: z.boolean().default(false),
    plow: z.boolean().default(false),
  }),
  reward: rewardSchema,
});

export const levelsSchema = z
  .object({
    thresholds: z.array(z.number().nonnegative()).min(1),
    cashPerLevel: z.number().nonnegative(),
  })
  .refine((l) => l.thresholds[0] === 0, 'level 1 must start at 0 XP')
  .refine((l) => l.thresholds.every((t, i, a) => i === 0 || t > (a[i - 1] ?? 0)), 'thresholds must increase');

const triple = z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]);

export const baseSchema = z.object({
  plowCost: coins,
  plowXp: z.number().nonnegative(),
  sellRefundFactor: z.number().min(0).max(1),
  startFarmSize: z.number().int().min(4),
  storageCapacity: z.number().int().nonnegative(),
  fuelMax: z.number().positive(),
  fuelPerCash: z.number().positive(),
  treeHarvestXp: z.number().nonnegative(),
  animalHarvestXp: z.number().nonnegative(),
  collectibleChance: z.number().min(0).max(1),
  mastery: z.object({
    longCropHours: hours,
    shortThresholds: triple,
    longThresholds: triple,
    coinsPerStarFactor: z.number().nonnegative(),
    xpPerStar: z.number().nonnegative(),
    seedDiscount: z.number().min(0).max(1),
    rewardItemId: id,
  }),
  ribbonRewards: z.array(rewardSchema).length(4),
  dailyBonus: z.object({
    cooldownHours: hours,
    streakWindowHours: hours,
    days: z.array(rewardSchema).min(1),
  }),
});

export type Reward = z.infer<typeof rewardSchema>;
export type CropDef = Omit<z.infer<typeof cropSchema>, 'growHours' | 'mastery'> & {
  growMs: number;
  /** Harvests needed for each mastery star, before rules.masteryGoal. */
  mastery: [number, number, number];
};
export type DecorationDef = z.infer<typeof decorationSchema>;
export type TreeDef = Omit<z.infer<typeof treeSchema>, 'cycleHours'> & { cycleMs: number };
export type AnimalDef = Omit<z.infer<typeof animalSchema>, 'cycleHours'> & { cycleMs: number };
export type BuildingDef = z.infer<typeof buildingSchema>;
export type VehicleDef = z.infer<typeof vehicleSchema>;
export type VehicleAction = VehicleDef['actions'][number];
export type ExpansionDef = z.infer<typeof expansionSchema>;
export type RibbonDef = z.infer<typeof ribbonSchema>;
export type CollectionDef = z.infer<typeof collectionSchema>;
export type LevelsDef = z.infer<typeof levelsSchema>;
export type BaseDef = z.infer<typeof baseSchema>;

/** Things that can stand on the farm (bought from the market or placed from inventory). */
export type PlaceableKind = 'decoration' | 'tree' | 'animal' | 'building';

export interface PlaceableInfo {
  kind: PlaceableKind;
  id: string;
  name: string;
  cost: number;
  xp: number;
  width: number;
  height: number;
  unlockLevel: number;
  buyable: boolean;
}

/** Every item that can be bought or placed, keyed by id. */
export interface Content {
  crops: Readonly<Record<string, CropDef>>;
  decorations: Readonly<Record<string, DecorationDef>>;
  trees: Readonly<Record<string, TreeDef>>;
  animals: Readonly<Record<string, AnimalDef>>;
  buildings: Readonly<Record<string, BuildingDef>>;
  vehicles: Readonly<Record<string, VehicleDef>>;
  /** Placeables of every kind, for code that doesn't care which kind. */
  placeables: Readonly<Record<string, PlaceableInfo>>;
  /** Sorted by size. */
  expansions: readonly ExpansionDef[];
  ribbons: readonly RibbonDef[];
  collections: readonly CollectionDef[];
  /** Collectible id -> its collection id. */
  collectibleSet: Readonly<Record<string, string>>;
  levels: LevelsDef;
  base: BaseDef;
}
