import { describe, expect, it } from 'vitest';
import { ShelfPacker } from '../../src/game/art/atlas';

describe('atlas shelf packer', () => {
  it('fills rows left to right, then starts a new row', () => {
    const p = new ShelfPacker(100, 100, 0);
    expect(p.place(40, 10)).toEqual({ page: 0, x: 0, y: 0 });
    expect(p.place(40, 20)).toEqual({ page: 0, x: 40, y: 0 });
    expect(p.place(40, 10)).toEqual({ page: 0, x: 0, y: 20 }); // row height = tallest in the row
  });

  it('starts a new page when one is full, and never overlaps', () => {
    const p = new ShelfPacker(64, 64, 2);
    const rects = Array.from({ length: 30 }, () => ({ ...p.place(20, 20), w: 20, h: 20 }));
    expect(p.pages).toBeGreaterThan(1);
    for (const a of rects) {
      expect(a.x + a.w).toBeLessThanOrEqual(64);
      expect(a.y + a.h).toBeLessThanOrEqual(64);
      for (const b of rects) {
        if (a === b || a.page !== b.page) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('rejects sprites bigger than a page', () => {
    expect(() => new ShelfPacker(64, 64).place(100, 10)).toThrow(/larger than an atlas page/);
  });
});
