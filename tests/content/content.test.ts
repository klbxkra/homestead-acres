import { describe, expect, it } from 'vitest';
import { buildContent, defaultContent } from '../../src/content';
import crops from '../../src/content/crops.json';
import decorations from '../../src/content/decorations.json';
import levels from '../../src/content/levels.json';
import base from '../../src/content/base.json';

const raw = () => structuredClone({ crops, decorations, levels, base });

describe('content', () => {
  it('loads the default tables', () => {
    expect(Object.keys(defaultContent.crops)).toHaveLength(8);
    expect(defaultContent.crops['strawberry']?.growMs).toBe(4 * 60 * 60 * 1000);
    expect(defaultContent.levels.thresholds).toHaveLength(70);
  });

  it('has a level-1 crop to start with', () => {
    expect(Object.values(defaultContent.crops).some((c) => c.unlockLevel === 1)).toBe(true);
  });

  it('rejects duplicate ids across tables', () => {
    const r = raw();
    r.decorations[0]!.id = 'strawberry';
    expect(() => buildContent(r)).toThrow(/duplicate item id "strawberry"/);
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

  it('rejects level tables that do not increase', () => {
    const r = raw();
    r.levels.thresholds[3] = 1;
    expect(() => buildContent(r)).toThrow(/thresholds must increase/);
  });
});
