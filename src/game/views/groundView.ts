/**
 * The farm's land: one grass sprite per tile (from the atlas, so they batch)
 * plus the earth showing along the two front edges, which gives the farm some
 * thickness. Grass tiles are culled with everything else when off screen.
 */
import Phaser from 'phaser';
import { grassKey, GRASS_VARIANTS, setArt, TEX_SCALE } from '../art/textures';
import { farmBounds, tileToWorld } from '../iso';

/** Depth below the soil of plowed plots. */
const GROUND_DEPTH = -30;
/** How far the earth "slab" shows below the front edges, in world px. */
const SLAB = 12;

export class GroundView {
  private tiles: Phaser.GameObjects.Image[] = [];
  private readonly edge: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.edge = scene.add.graphics().setDepth(GROUND_DEPTH - 1);
  }

  rebuild(w: number, h: number): void {
    for (const t of this.tiles) t.destroy();
    this.tiles = [];
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const { x, y } = tileToWorld(tx, ty);
        // Checkerboard of two greens, each with a few variants so the grass isn't a grid of copies.
        const checker = (tx + ty) % 2;
        const variant = hash(tx, ty) % GRASS_VARIANTS;
        const img = setArt(this.scene.add.image(x, y, '__DEFAULT'), grassKey(checker, variant)).setScale(1 / TEX_SCALE).setDepth(GROUND_DEPTH);
        this.tiles.push(img);
      }
    }
    this.drawEdge(w, h);
  }

  /** Hides tiles outside `view` (world rect, with margin). */
  cull(view: Phaser.Geom.Rectangle): void {
    for (const t of this.tiles) {
      const visible = t.x > view.left - 40 && t.x < view.right + 40 && t.y > view.top - 24 && t.y < view.bottom + 24;
      if (t.visible !== visible) t.setVisible(visible);
    }
  }

  private drawEdge(w: number, h: number): void {
    const b = farmBounds(w, h);
    const left = { x: b.left, y: (b.top + b.bottom) / 2 };
    const bottom = { x: tileToWorld(w - 1, h - 1).x, y: b.bottom };
    const right = { x: b.right, y: (b.top + b.bottom) / 2 };
    const g = this.edge.clear();
    // Left front face (lit) and right front face (shaded).
    g.fillStyle(0x8d6e63, 1);
    g.fillPoints([left, bottom, { x: bottom.x, y: bottom.y + SLAB }, { x: left.x, y: left.y + SLAB }], true);
    g.fillStyle(0x6d4c41, 1);
    g.fillPoints([bottom, right, { x: right.x, y: right.y + SLAB }, { x: bottom.x, y: bottom.y + SLAB }], true);
    // A darker strip of grass roots along the top of the slab.
    g.lineStyle(2, 0x558b2f, 1);
    g.strokePoints([left, bottom, right], false);
    g.lineStyle(1.5, 0x4e342e, 0.7);
    g.strokePoints([{ x: left.x, y: left.y + SLAB }, { x: bottom.x, y: bottom.y + SLAB }, { x: right.x, y: right.y + SLAB }], false);
  }

  destroy(): void {
    for (const t of this.tiles) t.destroy();
    this.tiles = [];
    this.edge.destroy();
  }
}

/** Small deterministic hash so each tile keeps its grass variant. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
