/** Isometric projection helpers (PLAN.md section 10): 2:1 diamond tiles. */

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export interface Point {
  x: number;
  y: number;
}

/** Centre of tile (tx, ty) in world pixels. Tile (0, 0) is the top corner of the farm. */
export function tileToWorld(tx: number, ty: number): Point {
  return {
    x: (tx - ty) * (TILE_WIDTH / 2),
    y: (tx + ty) * (TILE_HEIGHT / 2),
  };
}

/** Fractional tile coordinates under a world point; floor the result to get the tile index. */
export function worldToTile(wx: number, wy: number): Point {
  const a = wx / (TILE_WIDTH / 2);
  const b = wy / (TILE_HEIGHT / 2);
  return {
    x: (a + b) / 2 + 0.5,
    y: (b - a) / 2 + 0.5,
  };
}

/** Tile index under a world point (inverse of tileToWorld, rounding to the containing diamond). */
export function pickTile(wx: number, wy: number): Point {
  const t = worldToTile(wx, wy);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
}

/** Draw-order key: things further "down" the screen draw on top. */
export function depthOf(tx: number, ty: number): number {
  return tx + ty;
}

/** World-space bounding box of a rectangular farm of size w x h tiles. */
export function farmBounds(w: number, h: number): { left: number; right: number; top: number; bottom: number } {
  return {
    left: tileToWorld(0, h - 1).x - TILE_WIDTH / 2,
    right: tileToWorld(w - 1, 0).x + TILE_WIDTH / 2,
    top: tileToWorld(0, 0).y - TILE_HEIGHT / 2,
    bottom: tileToWorld(w - 1, h - 1).y + TILE_HEIGHT / 2,
  };
}
