import Phaser from 'phaser';
import { DEPTH } from '../views/entityViews';

export type FloatKind = 'coins' | 'cost' | 'xp';

const COLORS: Record<FloatKind, string> = {
  coins: '#ffd54f',
  cost: '#ffccbc',
  xp: '#b3e5fc',
};

/** "+35" style pop-up that rises and fades at a world position. */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, kind: FloatKind, delayMs = 0): void {
  const label = scene.add
    .text(x, y, text, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: COLORS[kind],
      stroke: '#3e2723',
      strokeThickness: 4,
    })
    .setOrigin(0.5, 1)
    .setDepth(DEPTH.fx)
    .setResolution(Math.min(window.devicePixelRatio || 1, 2) * 2)
    .setAlpha(0);

  scene.tweens.add({
    targets: label,
    y: y - 34,
    alpha: { from: 1, to: 0 },
    duration: 1100,
    delay: delayMs,
    ease: 'Cubic.easeOut',
    onStart: () => label.setAlpha(1),
    onComplete: () => label.destroy(),
  });
}
