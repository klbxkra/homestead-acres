/** Trees, animals and animal buildings: produce on a cycle, never wither (PLAN.md 4.3-4.4). */
import { inBounds, reject } from './context';
import type { Ctx, Tile } from './context';
import { animalCycleMs, productionYield, treeCycleMs } from './economy';
import { harvestCrop } from './fieldwork';
import { entityAt } from './grid';
import { lookup } from './ids';
import { gainXp } from './progression';
import { addCounter, rollCollectibles } from './rewards';
import type { AnimalEntity, BuildingEntity, Entity, TreeEntity } from './state';

/** Harvest whatever is at the tile: crop, tree, animal, or every ready animal in a building. */
export function harvestAt(ctx: Ctx, at: Tile): void {
  if (!inBounds(ctx, at)) reject('out_of_bounds', 'That spot is outside the farm.');
  const entity = entityAt(ctx.farm, at.x, at.y, ctx.content) ?? reject('not_plowed', 'Plow this spot first.');
  switch (entity.kind) {
    case 'plot':
      return harvestCrop(ctx, entity, at);
    case 'tree':
      return harvestTree(ctx, entity);
    case 'animal':
      return collectAnimal(ctx, entity);
    case 'building':
      return collectBuilding(ctx, entity);
    case 'decoration':
      reject('nothing_to_do', 'There is nothing to harvest here.');
  }
}

function harvestTree(ctx: Ctx, tree: TreeEntity): void {
  const def = lookup(ctx.content.trees, tree.itemId) ?? reject('unknown_item', 'Unknown tree.');
  if (ctx.now < tree.readyAt) reject('not_ripe', `${def.name} isn't ready yet.`);
  const coins = productionYield(def, ctx.rules);
  ctx.player.coins += coins;
  tree.readyAt = ctx.now + treeCycleMs(def, ctx.rules);
  ctx.events.push({ type: 'collected', x: tree.x, y: tree.y, entityId: tree.id, itemId: tree.itemId, coins, count: 1 });
  gainXp(ctx.player, ctx.content.base.treeHarvestXp * ctx.rules.xpGain, ctx.content.levels, ctx.rules, ctx.events);
  addCounter(ctx, 'treesHarvested');
  addCounter(ctx, 'coinsEarned', coins);
  rollCollectibles(ctx, { tree: true }, tree);
}

function collectAnimal(ctx: Ctx, animal: AnimalEntity): void {
  const def = lookup(ctx.content.animals, animal.itemId) ?? reject('unknown_item', 'Unknown animal.');
  if (ctx.now < animal.readyAt) reject('not_ripe', `The ${def.name.toLowerCase()} isn't ready yet.`);
  const coins = productionYield(def, ctx.rules);
  ctx.player.coins += coins;
  animal.readyAt = ctx.now + animalCycleMs(def, ctx.rules);
  ctx.events.push({ type: 'collected', x: animal.x, y: animal.y, entityId: animal.id, itemId: animal.itemId, coins, count: 1 });
  gainXp(ctx.player, ctx.content.base.animalHarvestXp * ctx.rules.xpGain, ctx.content.levels, ctx.rules, ctx.events);
  addCounter(ctx, 'animalsCollected');
  addCounter(ctx, 'coinsEarned', coins);
  rollCollectibles(ctx, { animal: true }, animal);
}

function collectBuilding(ctx: Ctx, building: BuildingEntity): void {
  const ready = building.housed.filter((a) => a.readyAt <= ctx.now);
  if (ready.length === 0) {
    reject(building.housed.length ? 'not_ripe' : 'nothing_to_do', building.housed.length ? 'Nothing to collect yet.' : 'No animals live here yet.');
  }
  let coins = 0;
  for (const a of ready) {
    const def = lookup(ctx.content.animals, a.itemId);
    if (!def) continue;
    coins += productionYield(def, ctx.rules);
    a.readyAt = ctx.now + animalCycleMs(def, ctx.rules);
  }
  ctx.player.coins += coins;
  const itemId = ready[0]!.itemId;
  ctx.events.push({ type: 'collected', x: building.x, y: building.y, entityId: building.id, itemId, coins, count: ready.length });
  gainXp(ctx.player, ctx.content.base.animalHarvestXp * ready.length * ctx.rules.xpGain, ctx.content.levels, ctx.rules, ctx.events);
  addCounter(ctx, 'animalsCollected', ready.length);
  addCounter(ctx, 'coinsEarned', coins);
  rollCollectibles(ctx, { animal: true }, building);
}

/** For views, tooltips and the multi-tool: is there something to collect here? */
export function isProducing(entity: Entity, gameNow: number): boolean {
  if (entity.kind === 'tree' || entity.kind === 'animal') return gameNow >= entity.readyAt;
  if (entity.kind === 'building') return entity.housed.some((a) => a.readyAt <= gameNow);
  return false;
}

/** Ready time of the next animal in a building, or null when none live there. */
export function nextReadyAt(entity: BuildingEntity): number | null {
  return entity.housed.length ? Math.min(...entity.housed.map((a) => a.readyAt)) : null;
}
