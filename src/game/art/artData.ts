/**
 * Placeholder art parameters, kept out of content/ because they are purely visual.
 * Replaced by a sprite atlas in Phase 7.
 */

export type PlantStyle = 'bush' | 'stalk' | 'vine';

export interface CropArt {
  style: PlantStyle;
  /** Colour of ripe produce. */
  fruit: number;
  /** CSS colour for UI swatches. */
  css: string;
}

export const CROP_ART: Record<string, CropArt> = {
  strawberry: { style: 'bush', fruit: 0xe53935, css: '#e53935' },
  soybean: { style: 'bush', fruit: 0xc5e1a5, css: '#9ccc65' },
  eggplant: { style: 'bush', fruit: 0x6a1b9a, css: '#7b1fa2' },
  pumpkin: { style: 'vine', fruit: 0xfb8c00, css: '#fb8c00' },
  wheat: { style: 'stalk', fruit: 0xf2c94c, css: '#f2c94c' },
  raspberry: { style: 'bush', fruit: 0xd81b60, css: '#d81b60' },
  rice: { style: 'stalk', fruit: 0xefe3b8, css: '#d8c88f' },
  tomato: { style: 'bush', fruit: 0xff5722, css: '#ff5722' },
};

export const DEFAULT_CROP_ART: CropArt = { style: 'bush', fruit: 0xffffff, css: '#cccccc' };

export interface DecorationArt {
  /** Box height in world px. */
  height: number;
  /** Footprint shrink factor (1 = fills its tiles). */
  inset: number;
  top: number;
  left: number;
  right: number;
  css: string;
}

export const DECORATION_ART: Record<string, DecorationArt> = {
  hay_bale: { height: 14, inset: 0.7, top: 0xf2d16b, left: 0xd9b44a, right: 0xb8952f, css: '#e8c34a' },
  white_fence: { height: 12, inset: 0.35, top: 0xffffff, left: 0xe6e6e6, right: 0xc9c9c9, css: '#f0f0f0' },
  garden_bench: { height: 10, inset: 0.65, top: 0xa1704a, left: 0x8a5a36, right: 0x6e4527, css: '#8a5a36' },
};

export const DEFAULT_DECORATION_ART: DecorationArt = {
  height: 16,
  inset: 0.8,
  top: 0xff66cc,
  left: 0xdd44aa,
  right: 0xbb2288,
  css: '#ff66cc',
};

export function cropArt(cropId: string): CropArt {
  return Object.hasOwn(CROP_ART, cropId) ? CROP_ART[cropId]! : DEFAULT_CROP_ART;
}

export function decorationArt(itemId: string): DecorationArt {
  return Object.hasOwn(DECORATION_ART, itemId) ? DECORATION_ART[itemId]! : DEFAULT_DECORATION_ART;
}
