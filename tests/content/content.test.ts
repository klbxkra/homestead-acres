import { describe, expect, it } from 'vitest';
import { buildContent, defaultContent } from '../../src/content';
import animals from '../../src/content/animals.json';
import base from '../../src/content/base.json';
import buildings from '../../src/content/buildings.json';
import collections from '../../src/content/collections.json';
import contracts from '../../src/content/contracts.json';
import crops from '../../src/content/crops.json';
import decorations from '../../src/content/decorations.json';
import expansions from '../../src/content/expansions.json';
import gifts from '../../src/content/gifts.json';
import levels from '../../src/content/levels.json';
import neighbors from '../../src/content/neighbors.json';
import ribbons from '../../src/content/ribbons.json';
import supplies from '../../src/content/supplies.json';
import trees from '../../src/content/trees.json';
import vehicles from '../../src/content/vehicles.json';

const raw = () =>
  structuredClone({ crops, decorations, trees, animals, buildings, vehicles, expansions, ribbons, collections, supplies, contracts, neighbors, gifts, levels, base });

describe('content', () => {
  it('loads the default tables', () => {
    expect(Object.keys(defaultContent.crops).length).toBeGreaterThanOrEqual(30);
    expect(defaultContent.crops['strawberry']?.growMs).toBe(4 * 60 * 60 * 1000);
    expect(defaultContent.levels.thresholds).toHaveLength(70);
    expect(Object.keys(defaultContent.trees).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(defaultContent.animals).length).toBeGreaterThanOrEqual(6);
    expect(defaultContent.expansions.map((e) => e.size)).toEqual([14, 16, 18, 20, 22, 24, 26]);
    expect(Object.keys(defaultContent.supplies).length).toBeGreaterThanOrEqual(8);
    expect(defaultContent.contracts.length).toBeGreaterThanOrEqual(10);
    expect(defaultContent.neighborPool.names.length).toBeGreaterThanOrEqual(20); // enough for the 20-neighbour limit
  });

  it('defines construction buildings whose parts all exist, and gifts that can be received', () => {
    const orchard = defaultContent.buildings['orchard']!;
    expect(orchard.construction).toBeDefined();
    for (const part of Object.keys(orchard.construction!)) expect(defaultContent.supplies[part]?.kind).toBe('part');
    // Every tree can live in the orchard.
    expect(new Set(orchard.houses)).toEqual(new Set(Object.keys(defaultContent.trees)));
    for (const g of defaultContent.gifts) expect(defaultContent.placeables[g.itemId] ?? defaultContent.supplies[g.itemId]).toBeDefined();
  });

  it('rejects construction parts, contract crops and gifts that do not exist', () => {
    const r1 = raw();
    (r1.buildings.find((b) => b.id === 'garage') as { construction: Record<string, number> }).construction = { gold_bar: 1 };
    expect(() => buildContent(r1)).toThrow(/unknown part "gold_bar"/);
    const r2 = raw();
    r2.contracts[0]!.goals[0]!.cropId = 'moonflower';
    expect(() => buildContent(r2)).toThrow(/unknown crop "moonflower"/);
    const r3 = raw();
    r3.gifts[0]!.itemId = 'strawberry';
    expect(() => buildContent(r3)).toThrow(/gift "strawberry"/);
  });

  it('unlocks crops across levels 1 to 40', () => {
    const levelsWithCrops = new Set(Object.values(defaultContent.crops).map((c) => c.unlockLevel));
    expect(levelsWithCrops.has(1)).toBe(true);
    expect(Math.max(...levelsWithCrops)).toBe(40);
  });

  it('indexes every placeable kind, with reward items not buyable', () => {
    const p = defaultContent.placeables;
    expect(p['hay_bale']).toMatchObject({ kind: 'decoration', buyable: true });
    expect(p['apple_tree']).toMatchObject({ kind: 'tree', width: 1, height: 1 });
    expect(p['chicken']).toMatchObject({ kind: 'animal' });
    expect(p['barn']).toMatchObject({ kind: 'building', width: 3, height: 3 });
    expect(p['mastery_sign']?.buyable).toBe(false);
    expect(defaultContent.collectibleSet['ladybug']).toBe('garden_bugs');
  });

  it('gives short and long crops different default mastery goals', () => {
    expect(defaultContent.crops['strawberry']!.mastery).toEqual(base.mastery.shortThresholds);
    expect(defaultContent.crops['wheat']!.mastery).toEqual(base.mastery.longThresholds);
  });

  it('rejects duplicate ids across every item table', () => {
    const r = raw();
    r.trees[0]!.id = 'strawberry';
    expect(() => buildContent(r)).toThrow(/duplicate item id "strawberry"/);
  });

  it('rejects references to things that do not exist', () => {
    const r1 = raw();
    r1.buildings[0]!.houses = ['dragon'];
    expect(() => buildContent(r1)).toThrow(/unknown animal or tree "dragon"/);
    const r2 = raw();
    r2.collections[0]!.sources.crops = ['moonflower'];
    expect(() => buildContent(r2)).toThrow(/unknown crop "moonflower"/);
    const r3 = raw();
    r3.collections[0]!.reward.itemId = 'unicorn';
    expect(() => buildContent(r3)).toThrow(/unknown item "unicorn"/);
  });

  it('rejects invalid values with the table name in the message', () => {
    const r = raw();
    r.crops[0]!.cost = -5;
    expect(() => buildContent(r)).toThrow(/crops/);
  });

  it('rejects badly formatted ids', () => {
    const r = raw();
    r.crops[0]!.id = 'Straw Berry';
    expect(() => buildContent(r)).toThrow(/lower_snake_case/);
  });

  it('rejects level tables that do not increase, and shrinking expansions', () => {
    const r = raw();
    r.levels.thresholds[3] = 1;
    expect(() => buildContent(r)).toThrow(/thresholds must increase/);
    const r2 = raw();
    r2.expansions[1]!.size = 13;
    expect(() => buildContent(r2)).toThrow(/expansions must grow/);
  });
});
