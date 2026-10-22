/**
 * Texture atlas (PLAN.md section 8, "pack sprites into texture atlases"): every
 * generated sprite is painted into a few large canvases instead of hundreds of
 * small textures, so the GPU can draw the farm in a handful of batches.
 */
import type Phaser from 'phaser';

export interface Placement {
  page: number;
  x: number;
  y: number;
}

/**
 * Shelf packing: rows of rectangles left to right, a new row when one doesn't
 * fit, a new page when a row doesn't. Good enough for sprites drawn in sizes
 * that repeat (tiles, crops, trees) and simple to reason about.
 */
export class ShelfPacker {
  private page = 0;
  private x = 0;
  private y = 0;
  private rowH = 0;

  constructor(
    readonly pageW: number,
    readonly pageH: number,
    private readonly pad = 2,
  ) {}

  get pages(): number {
    return this.page + 1;
  }

  place(w: number, h: number): Placement {
    const W = w + this.pad;
    const H = h + this.pad;
    if (W > this.pageW || H > this.pageH) throw new Error(`Sprite ${w}x${h} is larger than an atlas page`);
    if (this.x + W > this.pageW) {
      this.x = 0;
      this.y += this.rowH;
      this.rowH = 0;
    }
    if (this.y + H > this.pageH) {
      this.page++;
      this.x = 0;
      this.y = 0;
      this.rowH = 0;
    }
    const at = { page: this.page, x: this.x, y: this.y };
    this.x += W;
    this.rowH = Math.max(this.rowH, H);
    return at;
  }
}

export interface FrameRef {
  texture: string;
  frame: string;
}

/** Paints sprites into atlas pages; commit() turns the pages into Phaser textures. */
export class AtlasBuilder {
  private readonly packer: ShelfPacker;
  private readonly canvases: HTMLCanvasElement[] = [];
  private readonly frames: { key: string; page: number; x: number; y: number; w: number; h: number }[] = [];

  constructor(
    private readonly prefix: string,
    /** Canvas pixels per world pixel (sprites are drawn larger, then shown at 1/scale). */
    readonly scale: number,
    pageSize = 2048,
  ) {
    this.packer = new ShelfPacker(pageSize, pageSize, 2);
  }

  /** Paints a sprite `w` x `h` world pixels in size. `paint` draws in world pixels. */
  draw(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): void {
    const pw = Math.ceil(w * this.scale);
    const ph = Math.ceil(h * this.scale);
    const at = this.packer.place(pw, ph);
    const ctx = this.page(at.page);
    ctx.save();
    ctx.beginPath();
    ctx.rect(at.x, at.y, pw, ph);
    ctx.clip();
    ctx.translate(at.x, at.y);
    ctx.scale(this.scale, this.scale);
    paint(ctx);
    ctx.restore();
    this.frames.push({ key, page: at.page, x: at.x, y: at.y, w: pw, h: ph });
  }

  /** Registers the pages and frames with Phaser and returns where each sprite ended up. */
  commit(textures: Phaser.Textures.TextureManager): Map<string, FrameRef> {
    const refs = new Map<string, FrameRef>();
    this.canvases.forEach((canvas, i) => {
      const key = `${this.prefix}-${i}`;
      if (textures.exists(key)) textures.remove(key);
      textures.addCanvas(key, canvas);
    });
    for (const f of this.frames) {
      const texture = `${this.prefix}-${f.page}`;
      textures.get(texture).add(f.key, 0, f.x, f.y, f.w, f.h);
      refs.set(f.key, { texture, frame: f.key });
    }
    return refs;
  }

  private page(i: number): CanvasRenderingContext2D {
    while (this.canvases.length <= i) {
      const c = document.createElement('canvas');
      c.width = this.packer.pageW;
      c.height = this.packer.pageH;
      this.canvases.push(c);
    }
    return this.canvases[i]!.getContext('2d')!;
  }
}
