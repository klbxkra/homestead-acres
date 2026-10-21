import { z } from 'zod';
import {
  animalSchema,
  baseSchema,
  buildingSchema,
  collectionSchema,
  contractSchema,
  cropSchema,
  decorationSchema,
  expansionSchema,
  giftSchema,
  levelsSchema,
  neighborPoolSchema,
  ribbonSchema,
  supplySchema,
  treeSchema,
  vehicleSchema,
} from './schema';
import type { BaseDef, Content, CropDef, PlaceableInfo } from './schema';
import animals from './animals.json';
import base from './base.json';
import buildings from './buildings.json';
import collections from './collections.json';
import contracts from './contracts.json';
import crops from './crops.json';
import decorations from './decorations.json';
import expansions from './expansions.json';
import gifts from './gifts.json';
import levels from './levels.json';
import neighbors from './neighbors.json';
import ribbons from './ribbons.json';
import supplies from './supplies.json';
import trees from './trees.json';
import vehicles from './vehicles.json';

export type * from './schema';

const HOUR_MS = 60 * 60 * 1000;

export interface RawContent {
  crops: unknown;
  decorations: unknown;
  trees: unknown;
  animals: unknown;
  buildings: unknown;
  vehicles: unknown;
  expansions: unknown;
  ribbons: unknown;
  collections: unknown;
  supplies: unknown;
  contracts: unknown;
  neighbors: unknown;
  gifts: unknown;
  levels: unknown;
  base: unknown;
}

/** Validates raw content tables and builds lookup records. Throws with a readable message on bad data. */
export function buildContent(raw: RawContent): Content {
  const baseDef = parse('base', baseSchema, raw.base);
  const cropList = parse('crops', z.array(cropSchema), raw.crops);
  const decorationList = parse('decorations', z.array(decorationSchema), raw.decorations);
  const treeList = parse('trees', z.array(treeSchema), raw.trees);
  const animalList = parse('animals', z.array(animalSchema), raw.animals);
  const buildingList = parse('buildings', z.array(buildingSchema), raw.buildings);
  const vehicleList = parse('vehicles', z.array(vehicleSchema), raw.vehicles);
  const expansionList = parse('expansions', z.array(expansionSchema), raw.expansions);
  const ribbonList = parse('ribbons', z.array(ribbonSchema), raw.ribbons);
  const collectionList = parse('collections', z.array(collectionSchema), raw.collections);
  const supplyList = parse('supplies', z.array(supplySchema), raw.supplies);
  const contractList = parse('contracts', z.array(contractSchema), raw.contracts);
  const neighborPool = parse('neighbors', neighborPoolSchema, raw.neighbors);
  const giftList = parse('gifts', z.array(giftSchema), raw.gifts);

  // Item ids share one namespace (inventories and overrides are keyed by id).
  const itemIds = [...cropList, ...decorationList, ...treeList, ...animalList, ...buildingList, ...vehicleList, ...supplyList].map((i) => i.id);
  assertUnique(itemIds, 'item id');
  assertUnique(ribbonList.map((r) => r.id), 'ribbon id');
  assertUnique(collectionList.map((c) => c.id), 'collection id');
  assertUnique(contractList.map((c) => c.id), 'contract id');
  const collectibleIds = collectionList.flatMap((c) => c.items.map((i) => i.id));
  assertUnique(collectibleIds, 'collectible id');

  const known = new Set(itemIds);
  const animalIds = new Set(animalList.map((a) => a.id));
  const treeIds = new Set(treeList.map((t) => t.id));
  const cropIds = new Set(cropList.map((c) => c.id));
  const partIds = new Set(supplyList.filter((p) => p.kind === 'part').map((p) => p.id));
  for (const b of buildingList) {
    for (const a of b.houses) if (!animalIds.has(a) && !treeIds.has(a)) fail(`building ${b.id} houses unknown animal or tree "${a}"`);
    for (const part of Object.keys(b.construction ?? {})) if (!partIds.has(part)) fail(`building ${b.id} needs unknown part "${part}"`);
  }
  for (const c of contractList) {
    for (const g of c.goals) if (!cropIds.has(g.cropId)) fail(`contract ${c.id} asks for unknown crop "${g.cropId}"`);
    if (c.reward.itemId && !known.has(c.reward.itemId)) fail(`contract ${c.id} rewards unknown item "${c.reward.itemId}"`);
  }
  for (const g of giftList) {
    if (!known.has(g.itemId) || cropIds.has(g.itemId) || vehicleList.some((v) => v.id === g.itemId)) fail(`gift "${g.itemId}" is not a placeable item or supply`);
  }
  for (const c of collectionList) {
    for (const crop of c.sources.crops) if (!cropIds.has(crop)) fail(`collection ${c.id} lists unknown crop "${crop}"`);
    if (c.reward.itemId && !known.has(c.reward.itemId)) fail(`collection ${c.id} rewards unknown item "${c.reward.itemId}"`);
  }
  if (!known.has(baseDef.mastery.rewardItemId)) fail(`mastery reward item "${baseDef.mastery.rewardItemId}" does not exist`);
  const sizes = expansionList.map((e) => e.size);
  if (sizes.some((s, i) => i > 0 && s <= sizes[i - 1]!)) fail('expansions must grow in size');
  if ((sizes[0] ?? Infinity) <= baseDef.startFarmSize) fail('the first expansion must be bigger than the starting farm');

  const placeables: Record<string, PlaceableInfo> = {};
  for (const d of decorationList) placeables[d.id] = { kind: 'decoration', ...pick(d), width: d.width, height: d.height, buyable: d.buyable };
  for (const t of treeList) placeables[t.id] = { kind: 'tree', ...pick(t), width: 1, height: 1, buyable: true };
  for (const a of animalList) placeables[a.id] = { kind: 'animal', ...pick(a), width: 1, height: 1, buyable: true };
  for (const b of buildingList) placeables[b.id] = { kind: 'building', ...pick(b), width: b.width, height: b.height, buyable: true };

  return {
    crops: Object.fromEntries(cropList.map((c): [string, CropDef] => [c.id, toCropDef(c, baseDef)])),
    decorations: byId(decorationList),
    trees: byId(treeList.map(({ cycleHours, ...t }) => ({ ...t, cycleMs: cycleHours * HOUR_MS }))),
    animals: byId(animalList.map(({ cycleHours, ...a }) => ({ ...a, cycleMs: cycleHours * HOUR_MS }))),
    buildings: byId(buildingList),
    vehicles: byId(vehicleList),
    placeables,
    expansions: expansionList,
    ribbons: ribbonList,
    collections: collectionList,
    collectibleSet: Object.fromEntries(collectionList.flatMap((c) => c.items.map((i) => [i.id, c.id]))),
    supplies: byId(supplyList),
    contracts: contractList,
    neighborPool,
    gifts: giftList,
    levels: parse('levels', levelsSchema, raw.levels),
    base: baseDef,
  };
}

function toCropDef(c: z.infer<typeof cropSchema>, baseDef: BaseDef): CropDef {
  const { growHours, mastery, ...rest } = c;
  const m = baseDef.mastery;
  return {
    ...rest,
    growMs: growHours * HOUR_MS,
    mastery: mastery ?? (growHours > m.longCropHours ? m.longThresholds : m.shortThresholds),
  };
}

function pick(i: { id: string; name: string; cost: number; xp: number; unlockLevel: number }) {
  return { id: i.id, name: i.name, cost: i.cost, xp: i.xp, unlockLevel: i.unlockLevel };
}

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((i) => [i.id, i]));
}

function assertUnique(ids: string[], what: string): void {
  const dup = ids.find((x, i) => ids.indexOf(x) !== i);
  if (dup) fail(`duplicate ${what} "${dup}"`);
}

function fail(message: string): never {
  throw new Error(`Content error: ${message}`);
}

function parse<T>(table: string, schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Content error in ${table}: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const defaultContent: Content = buildContent({
  crops,
  decorations,
  trees,
  animals,
  buildings,
  vehicles,
  expansions,
  ribbons,
  collections,
  supplies,
  contracts,
  neighbors,
  gifts,
  levels,
  base,
});
