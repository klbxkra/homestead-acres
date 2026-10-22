/**
 * Small bits of juice (PLAN.md section 10): particle bursts for farm work. Built
 * from the atlas dot, tweened and destroyed; skipped in battery-saver mode by the
 * caller. (Level-up confetti is the UI's Celebration, so it ignores the zoom.)
 */
import Phaser from 'phaser';
import { DOT_KEY, setArt, TEX_SCALE } from '../art/textures';

const FX_DEPTH = 19_000;

export interface BurstOptions {
  count: number;
  colors: readonly number[];
  /** Spread in world px. */
  spread: number;
  /** Upward kick (positive = up). */
  rise: number;
  durationMs: number;
  /** Dot size multiplier. */
  size?: number;
  gravity?: boolean;
}

export function burst(scene: Phaser.Scene, x: number, y: number, o: BurstOptions): void {
  for (let i = 0; i < o.count; i++) {
    const a = Math.random() * Math.PI * 2;
    const dist = o.spread * (0.4 + Math.random() * 0.6);
    const dot = setArt(scene.add.image(x, y, '__DEFAULT'), DOT_KEY)
      .setScale(((o.size ?? 1) * (0.6 + Math.random() * 0.6)) / TEX_SCALE)
      .setTint(o.colors[i % o.colors.length]!)
      .setDepth(FX_DEPTH);
    const tx = x + Math.cos(a) * dist;
    const ty = y + Math.sin(a) * dist * 0.5 - o.rise * (0.5 + Math.random() * 0.5);
    scene.tweens.add({
      targets: dot,
      x: tx,
      y: o.gravity ? { value: ty + o.rise, ease: 'Quad.easeIn' } : ty,
      alpha: { from: 1, to: 0 },
      scale: dot.scale * 0.5,
      duration: o.durationMs * (0.7 + Math.random() * 0.5),
      ease: 'Cubic.easeOut',
      onComplete: () => dot.destroy(),
    });
  }
}
