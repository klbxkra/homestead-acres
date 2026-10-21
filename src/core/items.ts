/**
 * Placeable items: buying, placing from inventory, storing, selling, moving and
 * housing animals (PLAN.md sections 4.1, 4.4, 4.5).
 */
import type { PlaceableInfo } from '../content';
import type { InventorySource } from './commands';
import { bump, reject, spend, takeFrom } from './context';
import type { Ctx, Tile } from './context';
import { animalCycleMs, itemCost, itemRefund, itemXp, treeCycleMs } from './economy';
import { entityAt, itemSize, placementProblem } from './grid';
import { allocateId, lookup } from './ids';
import { gainXp } from './progression';
import { addCounter } from './rewards';
import type { BuildingEntity, FarmState, ItemEntity, PlayerState } from './state';
import type { Content } from '../content';

function placeable(ctx: Ctx, itemId: string): PlaceableInfo {
  return lookup(ctx.content.placeables, itemId) ?? reject('unknown_item', `Unknown item "${itemId}".`);
}

function checkFits(ctx: Ctx, itemId: string, at: Tile, rotated: boolean, ignoreId?: string): void {
  const size = itemSize(itemId, rotated, ctx.content) ?? reject('unknown_item', `Unknown item "${itemId}".`);
  const problem = placementProblem(ctx.farm, { ...at, ...size }, ctx.content, ignoreId);
  if (problem) reject(problem, problem === 'occupied' ? 'Something is in the way.' : 'That does not fit on the farm.');
}

/** A finished building at the tile that can house this animal or tree (or null if there's none there). */
function housingAt(ctx: Ctx, at: Tile, itemId: string): BuildingEntity | null {
  const target = entityAt(ctx.farm, at.x, at.y, ctx.content);
  if (target?.kind !== 'building' || !isBuilt(target)) return null;
  const def = lookup(ctx.content.buildings, target.itemId);
  if (!def || !def.houses.includes(itemId)) return null;
  if (target.housed.length >= def.capacity) reject('building_full', `The ${def.name} is full.`);
  return target;
}

/** False while a construction building is still a frame waiting for parts. */
export function isBuilt(building: BuildingEntity): boolean {
  return building.parts === undefined;
}

/** Production cycle of a tree or animal living in a building. */
function cycleMsOf(ctx: Ctx, itemId: string): number {
  const tree = lookup(ctx.content.trees, itemId);
  if (tree) return treeCycleMs(tree, ctx.rules);
  return animalCycleMs(ctx.content.animals[itemId]!, ctx.rules);
}

function newEntity(ctx: Ctx, item: PlaceableInfo, at: Tile, rotated: boolean, asFrame: boolean): ItemEntity {
  const base = { id: allocateId(ctx.state, item.kind === 'decoration' ? 'deco' : item.kind), ownerId: ctx.player.id, x: at.x, y: at.y };
  switch (item.kind) {
    case 'decoration':
      return { ...base, kind: 'decoration', itemId: item.id, rotated };
    case 'building': {
      const frame = asFrame && lookup(ctx.content.buildings, item.id)?.construction !== undefined;
      return { ...base, kind: 'building', itemId: item.id, rotated, housed: [], ...(frame ? { parts: {} } : {}) };
    }
    case 'tree':
      return { ...base, kind: 'tree', itemId: item.id, readyAt: ctx.now + treeCycleMs(ctx.content.trees[item.id]!, ctx.rules) };
    case 'animal':
      return { ...base, kind: 'animal', itemId: item.id, readyAt: ctx.now + animalCycleMs(ctx.content.animals[item.id]!, ctx.rules) };
  }
}

/**
 * Puts a new item on the farm at `at`. Animals and trees dropped on a matching
 * building move in instead of standing on the grass. Construction buildings
 * bought from the market (`asFrame`) start as a frame that needs parts.
 */
function putOnFarm(ctx: Ctx, item: PlaceableInfo, at: Tile, rotated: boolean, cost: number, asFrame = false): void {
  if (item.kind === 'animal' || item.kind === 'tree') {
    const home = housingAt(ctx, at, item.id);
    if (home) {
      spend(ctx, cost);
      home.housed.push({ itemId: item.id, readyAt: ctx.now + cycleMsOf(ctx, item.id) });
      ctx.events.push({ type: 'animalHoused', buildingId: home.id, itemId: item.id, x: home.x, y: home.y });
      return;
    }
  }
  checkFits(ctx, item.id, at, rotated);
  spend(ctx, cost);
  const entity = newEntity(ctx, item, at, rotated, asFrame);
  ctx.farm.entities[entity.id] = entity;
  ctx.events.push({ type: 'placed', entityId: entity.id, itemId: item.id, cost, x: at.x, y: at.y });
}

export function buy(ctx: Ctx, itemId: string, at: Tile, rotated: boolean): void {
  const item = placeable(ctx, itemId);
  if (!item.buyable) reject('unknown_item', `${item.name} can't be bought.`);
  if (ctx.player.level < item.unlockLevel) reject('locked', `${item.name} unlocks at level ${item.unlockLevel}.`);
  putOnFarm(ctx, item, at, rotated, itemCost(item, ctx.rules), true);
  gainXp(ctx.player, itemXp(item, ctx.rules), ctx.content.levels, ctx.rules, ctx.events);
  addCounter(ctx, 'itemsBought');
}

export function placeFromInventory(ctx: Ctx, itemId: string, from: InventorySource, at: Tile, rotated: boolean): void {
  const item = placeable(ctx, itemId);
  const inventory = inventoryOf(ctx.player, from);
  if ((lookup(inventory, itemId) ?? 0) < 1) reject('not_in_inventory', `No ${item.name} in your ${from === 'giftBox' ? 'gift box' : 'storage'}.`);
  putOnFarm(ctx, item, at, rotated, 0);
  takeFrom(inventory, itemId);
}

/** Puts a farm item away into storage. Buildings must be empty first. */
export function store(ctx: Ctx, entityId: string): void {
  const entity = lookup(ctx.farm.entities, entityId) ?? reject('unknown_entity', 'That item is not on this farm.');
  if (entity.kind === 'plot') reject('invalid', 'Plots can\'t be stored. Use the sell tool to remove them.');
  if (entity.kind === 'building' && entity.housed.length) reject('not_empty', 'Animals live here. Move them out first.');
  if (entity.kind === 'building' && !isBuilt(entity)) reject('not_empty', 'Finish building it before putting it away.');
  const freeAfter = storageCapacity(ctx.farm, ctx.content, entityId) - storedCount(ctx.player);
  if (freeAfter < 1) reject('storage_full', 'Storage is full. Build a Storage Cellar or Barn for more room.');
  delete ctx.farm.entities[entityId];
  bump(ctx.player.storage, entity.itemId);
  ctx.events.push({ type: 'stored', entityId, itemId: entity.itemId });
}

/** Removes an entity for a partial refund. Plots (and their crops) refund nothing. */
export function sellEntity(ctx: Ctx, entityId: string): void {
  const entity = lookup(ctx.farm.entities, entityId) ?? reject('unknown_entity', 'That item is not on this farm.');
  let refund = 0;
  if (entity.kind !== 'plot') {
    if (entity.kind === 'building' && entity.housed.length) reject('not_empty', 'Animals live here. Move them out first.');
    if (storageCapacity(ctx.farm, ctx.content, entityId) < storedCount(ctx.player)) {
      reject('storage_full', 'Your storage would overflow. Take some items out first.');
    }
    const item = lookup(ctx.content.placeables, entity.itemId);
    refund = item ? itemRefund(item, ctx.content, ctx.rules) : 0;
  }
  ctx.player.coins += refund;
  delete ctx.farm.entities[entityId];
  ctx.events.push({ type: 'sold', entityId, refund });
}

export function sellFromInventory(ctx: Ctx, itemId: string, from: InventorySource): void {
  const inventory = inventoryOf(ctx.player, from);
  if ((lookup(inventory, itemId) ?? 0) < 1) reject('not_in_inventory', 'You don\'t have that item.');
  const item = lookup(ctx.content.placeables, itemId);
  const refund = item ? itemRefund(item, ctx.content, ctx.rules) : 0;
  takeFrom(inventory, itemId);
  ctx.player.coins += refund;
  ctx.events.push({ type: 'itemSold', itemId, refund });
}

/** Moves (and optionally rotates) an entity. Dropping an animal or tree on a matching building houses it. */
export function move(ctx: Ctx, entityId: string, at: Tile, rotated: boolean | undefined): void {
  const entity = lookup(ctx.farm.entities, entityId) ?? reject('unknown_entity', 'That item is not on this farm.');

  if (entity.kind === 'animal' || entity.kind === 'tree') {
    const home = housingAt(ctx, at, entity.itemId);
    if (home) {
      delete ctx.farm.entities[entityId];
      home.housed.push({ itemId: entity.itemId, readyAt: entity.readyAt });
      ctx.events.push({ type: 'animalHoused', buildingId: home.id, itemId: entity.itemId, x: home.x, y: home.y });
      return;
    }
  }

  const rotatable = entity.kind === 'decoration' || entity.kind === 'building';
  const newRotated = rotatable ? (rotated ?? entity.rotated) : false;
  if (entity.kind === 'plot') {
    const problem = placementProblem(ctx.farm, { ...at, w: 1, h: 1 }, ctx.content, entityId);
    if (problem) reject(problem, problem === 'occupied' ? 'Something is in the way.' : 'That does not fit on the farm.');
  } else {
    checkFits(ctx, entity.itemId, at, newRotated, entityId);
  }
  entity.x = at.x;
  entity.y = at.y;
  if (rotatable) entity.rotated = newRotated;
  ctx.events.push({ type: 'moved', entityId, x: at.x, y: at.y, rotated: newRotated });
}

// ---------------------------------------------------------------- inventory helpers

export function inventoryOf(player: PlayerState, from: InventorySource): Record<string, number> {
  return from === 'giftBox' ? player.giftBox : player.storage;
}

export function storedCount(player: PlayerState): number {
  return Object.values(player.storage).reduce((a, b) => a + b, 0);
}

/** Base storage plus storage buildings on the farm (optionally ignoring one being removed). */
export function storageCapacity(farm: FarmState, content: Content, ignoreEntityId?: string): number {
  let capacity = content.base.storageCapacity;
  for (const e of Object.values(farm.entities)) {
    if (e.kind !== 'building' || e.id === ignoreEntityId || !isBuilt(e)) continue;
    capacity += lookup(content.buildings, e.itemId)?.storage ?? 0;
  }
  return capacity;
}
