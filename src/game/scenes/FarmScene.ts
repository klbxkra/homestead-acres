import Phaser from 'phaser';
import { farmBounds, pickTile, tileToWorld, TILE_HEIGHT, TILE_WIDTH } from '../iso';

const FARM_SIZE = 12;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const DRAG_THRESHOLD_PX = 6;

/**
 * Phase 0 placeholder: an iso grass grid with drag-to-pan, wheel zoom and a
 * hover/tap highlight. Real views, tools and the gesture layer arrive in Phase 2.
 */
export class FarmScene extends Phaser.Scene {
  private highlight!: Phaser.GameObjects.Graphics;
  private userZoom = 1;
  private pixelRatio = 1;
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private dragging = false;

  constructor() {
    super('Farm');
  }

  create(): void {
    this.drawGround();

    this.highlight = this.add.graphics().setDepth(1000);

    const bounds = farmBounds(FARM_SIZE, FARM_SIZE);
    const margin = TILE_WIDTH * 4;
    this.cameras.main.setBounds(
      bounds.left - margin,
      bounds.top - margin,
      bounds.right - bounds.left + margin * 2,
      bounds.bottom - bounds.top + margin * 2,
    );
    this.cameras.main.centerOn(0, (bounds.top + bounds.bottom) / 2);
    this.cameras.main.setBackgroundColor('#3d6b2a');

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('wheel', this.onWheel, this);
  }

  /** Called by the game shell whenever the canvas is resized for a new device pixel ratio. */
  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
    this.applyZoom();
  }

  private applyZoom(): void {
    // The canvas is sized in device pixels, so camera zoom includes the pixel ratio
    // to keep world units equal to CSS pixels at userZoom = 1.
    this.cameras.main.setZoom(this.userZoom * this.pixelRatio);
  }

  private drawGround(): void {
    const g = this.add.graphics();
    for (let ty = 0; ty < FARM_SIZE; ty++) {
      for (let tx = 0; tx < FARM_SIZE; tx++) {
        const { x, y } = tileToWorld(tx, ty);
        const shade = (tx + ty) % 2 === 0 ? 0x7cb342 : 0x74a93d;
        g.fillStyle(shade, 1);
        this.diamondPath(g, x, y);
        g.fillPath();
        g.lineStyle(1, 0x5f8f2f, 0.6);
        this.diamondPath(g, x, y);
        g.strokePath();
      }
    }
  }

  private diamondPath(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    g.beginPath();
    g.moveTo(cx, cy - TILE_HEIGHT / 2);
    g.lineTo(cx + TILE_WIDTH / 2, cy);
    g.lineTo(cx, cy + TILE_HEIGHT / 2);
    g.lineTo(cx - TILE_WIDTH / 2, cy);
    g.closePath();
  }

  private showHighlight(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tile = pickTile(world.x, world.y);
    this.highlight.clear();
    if (tile.x < 0 || tile.y < 0 || tile.x >= FARM_SIZE || tile.y >= FARM_SIZE) return;
    const { x, y } = tileToWorld(tile.x, tile.y);
    this.highlight.lineStyle(2, 0xfff3b0, 1);
    this.diamondPath(this.highlight, x, y);
    this.highlight.strokePath();
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const cam = this.cameras.main;
    this.dragStart = { x: pointer.x, y: pointer.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
    this.dragging = false;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.dragStart && pointer.isDown) {
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      if (!this.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX * this.pixelRatio) {
        this.dragging = true;
      }
      if (this.dragging) {
        const cam = this.cameras.main;
        cam.setScroll(this.dragStart.scrollX - dx / cam.zoom, this.dragStart.scrollY - dy / cam.zoom);
        return;
      }
    }
    if (!pointer.wasTouch) this.showHighlight(pointer); // hover highlight is mouse-only
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) this.showHighlight(pointer); // a tap selects a tile
    this.dragStart = null;
    this.dragging = false;
  }

  private onWheel(_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    this.userZoom = Phaser.Math.Clamp(this.userZoom * (dy > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM);
    this.applyZoom();
  }
}
