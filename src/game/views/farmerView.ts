/**
 * Draws the farmer from the action queue's pose (PLAN.md section 10): walking
 * frames, a raised arm and tool icon while working, and small icons over every
 * tile with a job waiting.
 */
import Phaser from 'phaser';
import { farmerKey, jobIconKey, setArt, TALL_TEX_CENTER_Y, TALL_TEX_H, TEX_SCALE } from '../art/textures';
import { depthOf, tileToWorld } from '../iso';
import type { FarmerQueue } from '../queue/farmerQueue';

/** Above every farm object, below pop-up text. */
const MARKER_DEPTH = 9_000;

export class FarmerView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly tool: Phaser.GameObjects.Image;
  private readonly markers = new Map<number, Phaser.GameObjects.Image>();
  private walkClock = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.body = setArt(scene.add.image(0, 0, '__DEFAULT'), farmerKey('stand')).setScale(1 / TEX_SCALE).setOrigin(0.5, TALL_TEX_CENTER_Y / TALL_TEX_H);
    this.tool = scene.add.image(0, 0, '__DEFAULT').setScale(0.6 / TEX_SCALE).setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.body.setVisible(visible);
    if (!visible) {
      this.tool.setVisible(false);
      for (const m of this.markers.values()) m.setVisible(false);
    }
  }

  update(queue: FarmerQueue, dtMs: number, animate: boolean): void {
    if (!this.body.visible) return;
    const p = queue.pose;
    const at = tileToWorld(p.x, p.y);
    const depth = depthOf(p.x, p.y) + 0.2;
    this.body.setPosition(at.x, at.y).setDepth(depth).setFlipX(p.facing < 0);

    if (p.mode === 'walking') {
      this.walkClock += dtMs;
      const step = Math.floor(this.walkClock / 140) % 2;
      setArt(this.body, farmerKey(step ? 'step' : 'stand'));
      if (animate) this.body.y -= step ? 1.5 : 0;
    } else {
      this.walkClock = 0;
      setArt(this.body, farmerKey(p.mode === 'working' ? 'work' : 'stand'));
    }

    if (p.mode === 'working' && p.job) {
      const bob = animate ? Math.sin(p.work * Math.PI * 3) * 2 : 0;
      setArt(this.tool, jobIconKey(p.job.icon)).setVisible(true).setPosition(at.x + (p.facing > 0 ? 9 : -9), at.y - 40 + bob).setDepth(depth + 0.01);
    } else {
      this.tool.setVisible(false);
    }

    // Icons over waiting jobs (not the one being done).
    const waiting = new Set<number>();
    for (const job of queue.jobs) {
      if (job === p.job && p.mode === 'working') continue;
      waiting.add(job.id);
      let m = this.markers.get(job.id);
      if (!m) {
        const w = tileToWorld(job.x, job.y);
        m = setArt(this.scene.add.image(w.x, w.y - 6, '__DEFAULT'), jobIconKey(job.icon)).setScale(0.75 / TEX_SCALE).setAlpha(0.9).setDepth(MARKER_DEPTH);
        this.markers.set(job.id, m);
      }
      m.setVisible(true);
    }
    for (const [id, m] of this.markers) {
      if (!waiting.has(id)) {
        m.destroy();
        this.markers.delete(id);
      }
    }
  }

  /** Puts the farmer straight back to `tile` (a farm was loaded). */
  reset(): void {
    for (const m of this.markers.values()) m.destroy();
    this.markers.clear();
    this.tool.setVisible(false);
  }

  destroy(): void {
    this.reset();
    this.body.destroy();
    this.tool.destroy();
  }
}
