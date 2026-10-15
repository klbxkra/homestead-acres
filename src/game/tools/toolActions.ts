/**
 * What a tap (or a painted tile) does with the current tool. Pure: the scene
 * turns the outcome into a command, a menu, or a pick-up.
 */
import type { Content } from '../../content';
import { cropStatus, entityAt, isProducing, itemRefund, lookup } from '../../core';
import type { Command, Entity, FarmState, WorldRules } from '../../core';
import type { MarketTab, PlaceSource, ToolId } from '../../app/uiState';

export interface ToolContext {
  tool: ToolId;
  seedId: string | null;
  placeItemId: string | null;
  /** Where the held item comes from: bought from the market, or taken from an inventory. */
  placeFrom: PlaceSource;
  movingEntityId: string | null;
  vehicleId: string | null;
  rotated: boolean;
}

export type ToolOutcome =
  | { kind: 'command'; command: Command; confirm?: string }
  | { kind: 'openMarket'; tab: MarketTab }
  | { kind: 'pick'; entityId: string }
  | { kind: 'inspect' }
  | { kind: 'none'; reason?: string };

export interface TileTarget {
  x: number;
  y: number;
}

export function resolveTap(
  ctx: ToolContext,
  farm: FarmState,
  tile: TileTarget,
  gameNow: number,
  rules: WorldRules,
  content: Content,
): ToolOutcome {
  const { x, y } = tile;
  if (x < 0 || y < 0 || x >= farm.width || y >= farm.height) return { kind: 'none' };
  const entity = entityAt(farm, x, y, content);

  switch (ctx.tool) {
    case 'plow':
      return { kind: 'command', command: { type: 'plow', x, y } };
    case 'harvest':
      return { kind: 'command', command: { type: 'harvest', x, y } };
    case 'seed':
      if (!ctx.seedId) return { kind: 'openMarket', tab: 'seeds' };
      return { kind: 'command', command: { type: 'plant', x, y, cropId: ctx.seedId } };
    case 'place':
      if (!ctx.placeItemId) return { kind: 'openMarket', tab: 'decor' };
      if (ctx.placeFrom === 'market') return { kind: 'command', command: { type: 'buy', itemId: ctx.placeItemId, x, y, rotated: ctx.rotated } };
      return { kind: 'command', command: { type: 'place', itemId: ctx.placeItemId, from: ctx.placeFrom, x, y, rotated: ctx.rotated } };
    case 'store':
      return entity && entity.kind !== 'plot' ? { kind: 'command', command: { type: 'store', entityId: entity.id } } : { kind: 'none' };
    case 'vehicle':
      if (!ctx.vehicleId) return { kind: 'openMarket', tab: 'vehicles' };
      return {
        kind: 'command',
        command: { type: 'useVehicle', vehicleId: ctx.vehicleId, x, y, ...(ctx.seedId ? { cropId: ctx.seedId } : {}) },
      };
    case 'move':
      if (ctx.movingEntityId) {
        return { kind: 'command', command: { type: 'move', entityId: ctx.movingEntityId, x, y, rotated: ctx.rotated } };
      }
      return entity ? { kind: 'pick', entityId: entity.id } : { kind: 'none' };
    case 'sell':
      return entity ? sellOutcome(entity, gameNow, rules, content) : { kind: 'none' };
    case 'multi':
      return multiOutcome(ctx, entity, x, y, gameNow, rules);
  }
}

/** FV1-style multi-tool: plow grass and dead plots, harvest ripe crops, plant the chosen seed. */
function multiOutcome(
  ctx: ToolContext,
  entity: Entity | undefined,
  x: number,
  y: number,
  gameNow: number,
  rules: WorldRules,
): ToolOutcome {
  if (!entity) return { kind: 'command', command: { type: 'plow', x, y } };
  if (entity.kind !== 'plot') {
    return isProducing(entity, gameNow) ? { kind: 'command', command: { type: 'harvest', x, y } } : { kind: 'inspect' };
  }
  if (!entity.crop) {
    if (!entity.plowed) return { kind: 'command', command: { type: 'plow', x, y } };
    if (!ctx.seedId) return { kind: 'openMarket', tab: 'seeds' };
    return { kind: 'command', command: { type: 'plant', x, y, cropId: ctx.seedId } };
  }
  switch (cropStatus(entity.crop, gameNow, rules)) {
    case 'ripe':
      return { kind: 'command', command: { type: 'harvest', x, y } };
    case 'withered':
      return { kind: 'command', command: { type: 'plow', x, y } };
    case 'growing':
      return { kind: 'inspect' };
  }
}

function sellOutcome(entity: Entity, gameNow: number, rules: WorldRules, content: Content): ToolOutcome {
  const command: Command = { type: 'sell', entityId: entity.id };
  if (entity.kind !== 'plot') {
    const item = lookup(content.placeables, entity.itemId);
    const refund = item ? itemRefund(item, content, rules) : 0;
    const name = item?.name ?? 'this item';
    return { kind: 'command', command, confirm: refund > 0 ? `Sell ${name} for ${refund.toLocaleString('en-US')} coins?` : `Remove ${name}? It can't be sold for coins.` };
  }
  if (entity.crop && cropStatus(entity.crop, gameNow, rules) !== 'withered') {
    const name = lookup(content.crops, entity.crop.cropId)?.name ?? 'crop';
    return { kind: 'command', command, confirm: `Remove this plot and its ${name}?` };
  }
  return { kind: 'command', command };
}

/** Painting applies a tool across many plots; only plain commands without confirmation are allowed. */
export function resolvePaint(
  ctx: ToolContext,
  farm: FarmState,
  tile: TileTarget,
  gameNow: number,
  rules: WorldRules,
  content: Content,
): Command | null {
  const outcome = resolveTap(ctx, farm, tile, gameNow, rules, content);
  return outcome.kind === 'command' && !outcome.confirm ? outcome.command : null;
}
