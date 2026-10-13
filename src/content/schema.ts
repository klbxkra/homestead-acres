import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lower_snake_case');
const coins = z.number().int().nonnegative();
const level = z.number().int().min(1);

export const cropSchema = z.object({
  id,
  name: z.string().min(1),
  growHours: z.number().positive(),
  cost: coins,
  sellPrice: coins,
  xp: z.number().nonnegative(),
  unlockLevel: level,
});

export const decorationSchema = z.object({
  id,
  name: z.string().min(1),
  cost: coins,
  xp: z.number().nonnegative(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  unlockLevel: level,
});

export const levelsSchema = z
  .object({
    thresholds: z.array(z.number().nonnegative()).min(1),
    cashPerLevel: z.number().nonnegative(),
  })
  .refine((l) => l.thresholds[0] === 0, 'level 1 must start at 0 XP')
  .refine((l) => l.thresholds.every((t, i, a) => i === 0 || t > (a[i - 1] ?? 0)), 'thresholds must increase');

export const baseSchema = z.object({
  plowCost: coins,
  plowXp: z.number().nonnegative(),
  sellRefundFactor: z.number().min(0).max(1),
  startFarmSize: z.number().int().min(4),
});

export type CropDef = Omit<z.infer<typeof cropSchema>, 'growHours'> & { growMs: number };
export type DecorationDef = z.infer<typeof decorationSchema>;
export type LevelsDef = z.infer<typeof levelsSchema>;
export type BaseDef = z.infer<typeof baseSchema>;

/** Every item that can be bought or placed, keyed by id. */
export interface Content {
  crops: Readonly<Record<string, CropDef>>;
  decorations: Readonly<Record<string, DecorationDef>>;
  levels: LevelsDef;
  base: BaseDef;
}
