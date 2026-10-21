import { describe, expect, it } from 'vitest';
import { defaultContent } from '../../src/content';
import { ANIMAL_ART, BUILDING_ART, CROP_ART, DECORATION_ART, SUPPLY_ART, TREE_ART } from '../../src/game/art/artData';

/** New content without art falls back to a pink placeholder; this catches it before anyone sees one. */
describe('placeholder art', () => {
  it('covers every crop, item and supply', () => {
    const c = defaultContent;
    const missing = [
      ...Object.keys(c.crops).filter((id) => !Object.hasOwn(CROP_ART, id)),
      ...Object.keys(c.decorations).filter((id) => !Object.hasOwn(DECORATION_ART, id)),
      ...Object.keys(c.buildings).filter((id) => !Object.hasOwn(BUILDING_ART, id)),
      ...Object.keys(c.trees).filter((id) => !Object.hasOwn(TREE_ART, id)),
      ...Object.keys(c.animals).filter((id) => !Object.hasOwn(ANIMAL_ART, id)),
      ...Object.keys(c.supplies).filter((id) => !Object.hasOwn(SUPPLY_ART, id)),
    ];
    expect(missing).toEqual([]);
  });
});
