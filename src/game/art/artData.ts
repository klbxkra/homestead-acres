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

const crop = (style: PlantStyle, fruit: number): CropArt => ({ style, fruit, css: hex(fruit) });

export const CROP_ART: Record<string, CropArt> = {
  strawberry: crop('bush', 0xe53935),
  soybean: { style: 'bush', fruit: 0xc5e1a5, css: '#9ccc65' },
  eggplant: crop('bush', 0x6a1b9a),
  squash: crop('vine', 0xf9a825),
  cabbage: crop('bush', 0xaed581),
  pumpkin: crop('vine', 0xfb8c00),
  wheat: crop('stalk', 0xf2c94c),
  carrot: crop('bush', 0xff7043),
  raspberry: crop('bush', 0xd81b60),
  potato: crop('bush', 0xbcaaa4),
  rice: { style: 'stalk', fruit: 0xefe3b8, css: '#d8c88f' },
  corn: crop('stalk', 0xffeb3b),
  tomato: crop('bush', 0xff5722),
  onion: crop('bush', 0xd7ccc8),
  pepper: crop('bush', 0xd32f2f),
  blueberry: crop('bush', 0x3f51b5),
  sunflower: crop('stalk', 0xffc107),
  cotton: { style: 'bush', fruit: 0xffffff, css: '#eeeeee' },
  peas: crop('bush', 0x7cb342),
  watermelon: crop('vine', 0x2e7d32),
  grape: crop('bush', 0x7b1fa2),
  lavender: crop('stalk', 0x9575cd),
  pineapple: crop('bush', 0xfbc02d),
  coffee: crop('bush', 0x6d4c41),
  artichoke: crop('bush', 0x558b2f),
  sugar_cane: crop('stalk', 0xc5e1a5),
  cranberry: crop('bush', 0xb71c1c),
  lily: crop('bush', 0xf8bbd0),
  asparagus: crop('stalk', 0x8bc34a),
  yellow_melon: crop('vine', 0xfff176),
  broccoli: crop('bush', 0x33691e),
  pink_rose: crop('bush', 0xf06292),
  aloe_vera: crop('stalk', 0x81c784),
  green_tea: crop('bush', 0x689f38),
};

export const DEFAULT_CROP_ART: CropArt = { style: 'bush', fruit: 0xffffff, css: '#cccccc' };

/** Iso box: decorations, and the walls of buildings. */
export interface BoxArt {
  /** Box height in world px. */
  height: number;
  /** Footprint shrink factor (1 = fills its tiles). */
  inset: number;
  top: number;
  left: number;
  right: number;
  /** Buildings only: pyramid roof colour and height. */
  roof?: number;
  roofHeight?: number;
}

/** Box with sides shaded from the top colour. */
const box = (top: number, height: number, inset: number, extra: Partial<BoxArt> = {}): BoxArt => ({
  height,
  inset,
  top,
  left: shade(top, 0.85),
  right: shade(top, 0.7),
  ...extra,
});

export const DECORATION_ART: Record<string, BoxArt> = {
  hay_bale: box(0xf2d16b, 14, 0.7),
  white_fence: box(0xffffff, 12, 0.35),
  garden_bench: box(0xa1704a, 10, 0.65),
  stone_path: box(0xb0aca5, 2, 0.92),
  flower_bed: { height: 6, inset: 0.8, top: 0xec407a, left: 0x6d4c41, right: 0x5d4037 },
  scarecrow: box(0xfdd835, 26, 0.28),
  birdhouse: box(0x8d6e63, 22, 0.35),
  fountain: box(0x90caf9, 14, 0.85, { left: 0xbdbdbd, right: 0x9e9e9e }),
  windmill: box(0xeeeeee, 44, 0.55, { roof: 0x8d6e63, roofHeight: 18 }),
  mastery_sign: box(0xffd54f, 18, 0.3),
  garden_gnome: box(0xe53935, 14, 0.4),
  golden_hoe: box(0xffd700, 20, 0.3),
  flower_arch: box(0xf48fb1, 30, 0.4),
  lucky_horseshoe: box(0xb0bec5, 16, 0.35),
  golden_apple_statue: box(0xffd700, 20, 0.45),
  wooden_fence: box(0xa1704a, 12, 0.35),
  mailbox: box(0x1e88e5, 18, 0.3),
  tulip_bed: { height: 6, inset: 0.8, top: 0xff7043, left: 0x6d4c41, right: 0x5d4037 },
  lamp_post: box(0x37474f, 34, 0.2, { roof: 0xfff59d, roofHeight: 6 }),
  wheelbarrow: box(0x8d6e63, 10, 0.55),
  rose_bush: box(0xd81b60, 14, 0.6, { left: 0x388e3c, right: 0x2e7d32 }),
  hedge: box(0x558b2f, 14, 0.85),
  picnic_table: box(0xbc8f5f, 10, 0.7),
  wishing_well: box(0x9e9e9e, 14, 0.6, { roof: 0x8d6e63, roofHeight: 14 }),
  birdbath: box(0x90caf9, 16, 0.4, { left: 0xbdbdbd, right: 0x9e9e9e }),
  lily_pond: { height: 3, inset: 0.85, top: 0x4fc3f7, left: 0x8d6e63, right: 0x6d4c41 },
  stone_wall: box(0x9e9e9e, 12, 0.9),
  gazebo: box(0xfafafa, 22, 0.75, { roof: 0x2e7d32, roofHeight: 18 }),
  flag_pole: box(0xe53935, 46, 0.15),
  lighthouse: box(0xffffff, 56, 0.5, { roof: 0xc62828, roofHeight: 16 }),
  friendship_bench: box(0xf06292, 10, 0.65),
  copper_kettle: box(0xd84315, 12, 0.4),
  gold_trophy: box(0xffd700, 22, 0.3),
};

export const BUILDING_ART: Record<string, BoxArt> = {
  chicken_coop: box(0xd7a86e, 18, 0.85, { roof: 0xc62828, roofHeight: 14 }),
  storage_cellar: box(0x9e9e9e, 10, 0.9, { roof: 0x6d4c41, roofHeight: 8 }),
  dairy_farm: box(0xeeeeee, 22, 0.88, { roof: 0x1565c0, roofHeight: 16 }),
  sheep_pen: box(0xa1887f, 14, 0.9, { roof: 0x558b2f, roofHeight: 10 }),
  barn: box(0xb71c1c, 30, 0.9, { roof: 0x5d4037, roofHeight: 22 }),
  stable: box(0x8d6e63, 22, 0.88, { roof: 0x37474f, roofHeight: 16 }),
  orchard: { height: 8, inset: 0.95, top: 0x9ccc65, left: 0xa1704a, right: 0x8d6e63 },
  garage: box(0xb0bec5, 22, 0.88, { roof: 0x455a64, roofHeight: 12 }),
  duck_pond: { height: 4, inset: 0.9, top: 0x29b6f6, left: 0x8d6e63, right: 0x6d4c41 },
};

export const DEFAULT_BOX_ART: BoxArt = box(0xff66cc, 16, 0.8);

export interface TreeArt {
  canopy: number;
  fruit: number;
}

export const TREE_ART: Record<string, TreeArt> = {
  apple_tree: { canopy: 0x43a047, fruit: 0xe53935 },
  lemon_tree: { canopy: 0x689f38, fruit: 0xfff176 },
  cherry_tree: { canopy: 0x388e3c, fruit: 0xc62828 },
  orange_tree: { canopy: 0x2e7d32, fruit: 0xff9800 },
  peach_tree: { canopy: 0x66bb6a, fruit: 0xffab91 },
  plum_tree: { canopy: 0x4caf50, fruit: 0x7b1fa2 },
  banana_tree: { canopy: 0x7cb342, fruit: 0xffeb3b },
  olive_tree: { canopy: 0x827717, fruit: 0x33691e },
  avocado_tree: { canopy: 0x33691e, fruit: 0x9ccc65 },
  fig_tree: { canopy: 0x558b2f, fruit: 0x6d4c41 },
  pear_tree: { canopy: 0x7cb342, fruit: 0xd4e157 },
  pomegranate_tree: { canopy: 0x388e3c, fruit: 0xb71c1c },
  maple_tree: { canopy: 0xe65100, fruit: 0xffb300 },
  coconut_palm: { canopy: 0x2e7d32, fruit: 0x795548 },
};

export const DEFAULT_TREE_ART: TreeArt = { canopy: 0x43a047, fruit: 0xffffff };

export interface AnimalArt {
  body: number;
  accent: number;
  /** 0.6 = small (chicken) .. 1.3 = big (horse). */
  size: number;
  spots?: number;
}

export const ANIMAL_ART: Record<string, AnimalArt> = {
  chicken: { body: 0xffffff, accent: 0xe53935, size: 0.6 },
  cow: { body: 0xffffff, accent: 0xf8bbd0, size: 1.1, spots: 0x212121 },
  sheep: { body: 0xf5f5f5, accent: 0x424242, size: 0.95 },
  pig: { body: 0xf8bbd0, accent: 0xf06292, size: 0.9 },
  duck: { body: 0xfafafa, accent: 0xff9800, size: 0.6 },
  goat: { body: 0xd7ccc8, accent: 0x8d6e63, size: 0.9 },
  rabbit: { body: 0xbcaaa4, accent: 0xffffff, size: 0.55 },
  horse: { body: 0x8d6e63, accent: 0x4e342e, size: 1.3 },
  turkey: { body: 0x6d4c41, accent: 0xe53935, size: 0.75 },
  goose: { body: 0xeeeeee, accent: 0xff9800, size: 0.7 },
  donkey: { body: 0x9e9e9e, accent: 0x424242, size: 1.1 },
  llama: { body: 0xefe3c8, accent: 0x8d6e63, size: 1.15 },
};

export const DEFAULT_ANIMAL_ART: AnimalArt = { body: 0xff66cc, accent: 0x880e4f, size: 0.8 };

/** Supplies and building parts: an emoji on a coloured swatch (they never stand on the farm). */
export const SUPPLY_ART: Record<string, { icon: string; css: string }> = {
  fertilizer: { icon: '🌿', css: '#c5e1a5' },
  unwither_tonic: { icon: '💧', css: '#b3e5fc' },
  instagrow: { icon: '⚡', css: '#fff59d' },
  fuel_can: { icon: '⛽', css: '#ffcc80' },
  nail: { icon: '🔩', css: '#cfd8dc' },
  wooden_board: { icon: '🪵', css: '#d7ccc8' },
  brick: { icon: '🧱', css: '#ffab91' },
  shingle: { icon: '🏠', css: '#b0bec5' },
};

const VEHICLE_CSS: Record<string, string> = {
  tractor: '#d32f2f',
  seeder: '#388e3c',
  harvester: '#f9a825',
  combine: '#2e7d32',
};

export function cropArt(cropId: string): CropArt {
  return Object.hasOwn(CROP_ART, cropId) ? CROP_ART[cropId]! : DEFAULT_CROP_ART;
}

export function decorationArt(itemId: string): BoxArt {
  if (Object.hasOwn(DECORATION_ART, itemId)) return DECORATION_ART[itemId]!;
  if (Object.hasOwn(BUILDING_ART, itemId)) return BUILDING_ART[itemId]!;
  return DEFAULT_BOX_ART;
}

export function treeArt(itemId: string): TreeArt {
  return Object.hasOwn(TREE_ART, itemId) ? TREE_ART[itemId]! : DEFAULT_TREE_ART;
}

export function animalArt(itemId: string): AnimalArt {
  return Object.hasOwn(ANIMAL_ART, itemId) ? ANIMAL_ART[itemId]! : DEFAULT_ANIMAL_ART;
}

/** Emoji drawn on a swatch for items without farm art (supplies, parts), or null. */
export function itemIcon(itemId: string): string | null {
  return Object.hasOwn(SUPPLY_ART, itemId) ? SUPPLY_ART[itemId]!.icon : null;
}

/** A representative CSS colour for any item (market swatches, inventory). */
export function itemArtCss(itemId: string): string {
  if (Object.hasOwn(SUPPLY_ART, itemId)) return SUPPLY_ART[itemId]!.css;
  if (Object.hasOwn(TREE_ART, itemId)) return `radial-gradient(circle at 50% 40%, ${hex(TREE_ART[itemId]!.fruit)} 0 22%, ${hex(TREE_ART[itemId]!.canopy)} 24%)`;
  if (Object.hasOwn(ANIMAL_ART, itemId)) return hex(ANIMAL_ART[itemId]!.body === 0xffffff ? ANIMAL_ART[itemId]!.accent : ANIMAL_ART[itemId]!.body);
  if (Object.hasOwn(VEHICLE_CSS, itemId)) return VEHICLE_CSS[itemId]!;
  const b = decorationArt(itemId);
  return b.roof !== undefined ? `linear-gradient(${hex(b.roof)} 0 45%, ${hex(b.top)} 45%)` : hex(b.top);
}

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function shade(c: number, f: number): number {
  const r = Math.round(((c >> 16) & 255) * f);
  const g = Math.round(((c >> 8) & 255) * f);
  const b = Math.round((c & 255) * f);
  return (r << 16) | (g << 8) | b;
}
