import { describe, expect, it } from 'vitest';
import { defaultContent } from '../../src/content';
import { footprintOf, placementProblem, rectsOverlap } from '../../src/core';
import type { FarmState } from '../../src/core';

function farm(): FarmState {
  return {
    id: 'f',
    ownerId: 'p',
    name: 'F',
    width: 12,
    height: 12,
    entities: {
      plot1: { kind: 'plot', id: 'plot1', ownerId: 'p', x: 0, y: 0, plowed: true, crop: null },
      bench: { kind: 'decoration', id: 'bench', ownerId: 'p', x: 5, y: 5, itemId: 'garden_bench', rotated: false },
    },
  };
}

describe('grid', () => {
  it('detects overlapping rectangles, but not ones that only touch edges', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 1, h: 1 })).toBe(false);
  });

  it('uses item size for decorations and swaps it when rotated', () => {
    const f = farm();
    expect(footprintOf(f.entities['bench']!, defaultContent)).toEqual({ x: 5, y: 5, w: 2, h: 1 });
    expect(footprintOf({ ...f.entities['bench']!, rotated: true } as never, defaultContent)).toEqual({ x: 5, y: 5, w: 1, h: 2 });
  });

  it('reports out-of-bounds and occupied placements', () => {
    const f = farm();
    expect(placementProblem(f, { x: -1, y: 0, w: 1, h: 1 }, defaultContent)).toBe('out_of_bounds');
    expect(placementProblem(f, { x: 11, y: 0, w: 2, h: 1 }, defaultContent)).toBe('out_of_bounds');
    expect(placementProblem(f, { x: 0, y: 0, w: 1, h: 1 }, defaultContent)).toBe('occupied');
    expect(placementProblem(f, { x: 6, y: 5, w: 1, h: 1 }, defaultContent)).toBe('occupied'); // bench's 2nd tile
    expect(placementProblem(f, { x: 7, y: 5, w: 1, h: 1 }, defaultContent)).toBeNull();
  });

  it('ignores the entity being moved', () => {
    const f = farm();
    expect(placementProblem(f, { x: 6, y: 5, w: 2, h: 1 }, defaultContent, 'bench')).toBeNull();
  });
});
