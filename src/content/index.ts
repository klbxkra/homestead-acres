import { z } from 'zod';
import { baseSchema, cropSchema, decorationSchema, levelsSchema } from './schema';
import type { Content, CropDef } from './schema';
import crops from './crops.json';
import decorations from './decorations.json';
import levels from './levels.json';
import base from './base.json';

export type { Content, CropDef, DecorationDef, LevelsDef, BaseDef } from './schema';

const HOUR_MS = 60 * 60 * 1000;

export interface RawContent {
  crops: unknown;
  decorations: unknown;
  levels: unknown;
  base: unknown;
}

/** Validates raw content tables and builds lookup records. Throws with a readable message on bad data. */
export function buildContent(raw: RawContent): Content {
  const cropList = parse('crops', z.array(cropSchema), raw.crops);
  const decorationList = parse('decorations', z.array(decorationSchema), raw.decorations);

  const allIds = [...cropList, ...decorationList].map((item) => item.id);
  const duplicate = allIds.find((itemId, i) => allIds.indexOf(itemId) !== i);
  if (duplicate) throw new Error(`Content error: duplicate item id "${duplicate}"`);

  return {
    crops: Object.fromEntries(
      cropList.map(({ growHours, ...rest }): [string, CropDef] => [rest.id, { ...rest, growMs: growHours * HOUR_MS }]),
    ),
    decorations: Object.fromEntries(decorationList.map((d) => [d.id, d])),
    levels: parse('levels', levelsSchema, raw.levels),
    base: parse('base', baseSchema, raw.base),
  };
}

function parse<T>(table: string, schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Content error in ${table}: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const defaultContent: Content = buildContent({ crops, decorations, levels, base });
