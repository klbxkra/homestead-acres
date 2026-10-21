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
    /** Extra fuel tank capacity while placed (garages). */
    fuelBonus: z.number().int().nonnegative().default(0),
    /** Construction buildings: bought as a frame, finished with these parts (part id -> count). */
    construction: z.record(id, z.number().int().positive()).optional(),
  })
  .refine((b) => b.houses.length === 0 || b.capacity > 0, 'housing buildings need a capacity');

/** Consumable supplies and building parts. Kept in the gift box, never placed on the farm. */
export const supplySchema = z
  .object({
    id,
    name: z.string().min(1),
    kind: z.enum(['part', 'fertilizer', 'instagrow', 'unwither', 'fuel']),
    description: z.string().default(''),
    unlockLevel: level.default(1),
    /** Price in the market's Supplies tab: coins (scaled by buyCost) or Farm Cash. */
    coins: coins.optional(),
    cash: coins.optional(),
    /** Fertilizer / Instagrow: works on an area x area square. */
    area: z.number().int().min(1).max(5).optional(),
    /** Fuel cans: fuel added. */
    amount: z.number().positive().optional(),
  })
  .refine((s) => (s.coins ?? 0) > 0 || (s.cash ?? 0) > 0, 'supplies need a coin or cash price')
  .refine((s) => (s.kind !== 'fertilizer' && s.kind !== 'instagrow') || s.area !== undefined, 'area supplies need an area')
  .refine((s) => s.kind !== 'fuel' || s.amount !== undefined, 'fuel supplies need an amount');

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

export const rewardSchema = z.object({
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
    /** Helping on AI neighbours' farms. */
    neighbors: z.boolean().default(false),
  }),
  reward: rewardSchema,
});

/** Solo co-op jobs (PLAN.md section 4.8): grow these crops before time runs out. */
export const contractSchema = z.object({
  id,
  name: z.string().min(1),
  description: z.string().default(''),
  unlockLevel: level,
  durationHours: hours,
  goals: z.array(z.object({ cropId: id, count: z.number().int().positive() })).min(1),
  /** Gold-medal reward; silver and bronze pay a fraction (base.contracts). */
  reward: rewardSchema,
});

/** Name, avatar and colour pools for generated AI neighbours. */
export const neighborPoolSchema = z.object({
  names: z.array(z.string().min(1)).min(1),
  avatars: z.array(z.string().min(1)).min(1),
  colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(1),
});

/** What AI neighbours send as gifts. */
export const giftSchema = z.object({
  itemId: id,
  weight: z.number().positive(),
  unlockLevel: level.default(1),
  count: z.number().int().positive().default(1),
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
  /** Extra coins from a fertilized crop, as a fraction of its sale price. */
  fertilizeBonus: z.number().nonnegative(),
  /** Chance per housed animal collected that a baby arrives in the gift box (x collectibleDropRate). */
  babyChance: z.number().min(0).max(1),
  neighbors: z.object({
    /** Chance each AI neighbour visits your farm on a given game day. */
    visitChance: z.number().min(0).max(1),
    fertilizePerVisit: z.number().int().nonnegative(),
    helpCoins: coins,
    helpXp: z.number().nonnegative(),
    mailboxMax: z.number().int().positive(),
    /** Most game days of neighbour activity caught up after a long absence. */
    backlogDays: z.number().int().positive(),
    logMax: z.number().int().positive(),
    /** Neighbour level = player level + an offset in this range. */
    levelOffset: z.tuple([z.number().int(), z.number().int()]),
  }),
  contracts: z.object({
    /** Share of each goal an AI partner grows per game day. */
    partnerDailyShare: z.number().min(0).max(1),
    maxPartners: z.number().int().nonnegative(),
    /** Finish within this fraction of the time for gold / silver; bronze is anything before the deadline. */
    goldWithin: z.number().min(0).max(1),
    silverWithin: z.number().min(0).max(1),
    silverRewardFactor: z.number().min(0).max(1),
    bronzeRewardFactor: z.number().min(0).max(1),
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
export type SupplyDef = z.infer<typeof supplySchema>;
export type SupplyKind = SupplyDef['kind'];
export type ContractDef = z.infer<typeof contractSchema>;
export type NeighborPoolDef = z.infer<typeof neighborPoolSchema>;
export type GiftDef = z.infer<typeof giftSchema>;
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
  /** Consumables and building parts. */
  supplies: Readonly<Record<string, SupplyDef>>;
  /** Placeables of every kind, for code that doesn't care which kind. */
  placeables: Readonly<Record<string, PlaceableInfo>>;
  /** Sorted by size. */
  expansions: readonly ExpansionDef[];
  ribbons: readonly RibbonDef[];
  collections: readonly CollectionDef[];
  /** Collectible id -> its collection id. */
  collectibleSet: Readonly<Record<string, string>>;
  contracts: readonly ContractDef[];
  neighborPool: NeighborPoolDef;
  gifts: readonly GiftDef[];
  levels: LevelsDef;
  base: BaseDef;
}
