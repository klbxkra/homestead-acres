/** Farm grid occupancy and placement rules (PLAN.md section 4.1). Units are plots. */
import type { Content } from '../content';
import { lookup } from './ids';
import type { EntityId } from './ids';
import type { Entity, FarmState } from './state';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function itemSize(itemId: string, rotated: boolean, content: Content): { w: number; h: number } | null {
  const item = lookup(content.decorations, itemId);
  if (!item) return null;
  return rotated ? { w: item.height, h: item.width } : { w: item.width, h: item.height };
}

export function footprintOf(entity: Entity, content: Content): Rect {
  if (entity.kind === 'plot') return { x: entity.x, y: entity.y, w: 1, h: 1 };
  const size = itemSize(entity.itemId, entity.rotated, content) ?? { w: 1, h: 1 };
  return { x: entity.x, y: entity.y, ...size };
}

export function rectInBounds(farm: FarmState, r: Rect): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= farm.width && r.y + r.h <= farm.height;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The entity covering tile (x, y), if any. */
export function entityAt(farm: FarmState, x: number, y: number, content: Content): Entity | undefined {
  const probe = { x, y, w: 1, h: 1 };
  return Object.values(farm.entities).find((e) => rectsOverlap(footprintOf(e, content), probe));
}

export type PlacementProblem = 'out_of_bounds' | 'occupied';

/** Why `rect` can't be placed, or null if it can. `ignoreId` skips the entity being moved. */
export function placementProblem(
  farm: FarmState,
  rect: Rect,
  content: Content,
  ignoreId?: EntityId,
): PlacementProblem | null {
  if (!rectInBounds(farm, rect)) return 'out_of_bounds';
  for (const e of Object.values(farm.entities)) {
    if (e.id !== ignoreId && rectsOverlap(footprintOf(e, content), rect)) return 'occupied';
  }
  return null;
}
