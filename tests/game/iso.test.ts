import { describe, expect, it } from 'vitest';
import { farmBounds, pickTile, tileToWorld, TILE_HEIGHT, TILE_WIDTH } from '../../src/game/iso';

describe('iso projection', () => {
  it('places tile (0,0) at the origin and steps by half-tiles', () => {
    expect(tileToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileToWorld(1, 0)).toEqual({ x: TILE_WIDTH / 2, y: TILE_HEIGHT / 2 });
    expect(tileToWorld(0, 1)).toEqual({ x: -TILE_WIDTH / 2, y: TILE_HEIGHT / 2 });
  });

  it('picks the tile whose centre was projected', () => {
    for (let ty = 0; ty < 12; ty++) {
      for (let tx = 0; tx < 12; tx++) {
        const c = tileToWorld(tx, ty);
        expect(pickTile(c.x, c.y)).toEqual({ x: tx, y: ty });
      }
    }
  });

  it('picks the right tile near the diamond edges', () => {
    const c = tileToWorld(5, 5);
    // Just inside each corner of the diamond.
    expect(pickTile(c.x, c.y - TILE_HEIGHT / 2 + 1)).toEqual({ x: 5, y: 5 });
    expect(pickTile(c.x + TILE_WIDTH / 2 - 2, c.y)).toEqual({ x: 5, y: 5 });
    expect(pickTile(c.x, c.y + TILE_HEIGHT / 2 - 1)).toEqual({ x: 5, y: 5 });
    expect(pickTile(c.x - TILE_WIDTH / 2 + 2, c.y)).toEqual({ x: 5, y: 5 });
    // Just past the right corner (slightly below it) lands in the +x neighbour.
    expect(pickTile(c.x + TILE_WIDTH / 2 + 2, c.y + 2)).toEqual({ x: 6, y: 5 });
  });

  it('computes farm bounds that contain every tile', () => {
    const b = farmBounds(12, 12);
    for (const [tx, ty] of [[0, 0], [11, 0], [0, 11], [11, 11]] as const) {
      const c = tileToWorld(tx, ty);
      expect(c.x).toBeGreaterThan(b.left);
      expect(c.x).toBeLessThan(b.right);
      expect(c.y).toBeGreaterThan(b.top);
      expect(c.y).toBeLessThan(b.bottom);
    }
  });
});
