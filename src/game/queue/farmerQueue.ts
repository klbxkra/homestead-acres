/**
 * FarmVille's action queue (PLAN.md section 10): taps line up jobs, and the
 * farmer walks to each tile in turn and does the work. Pure (no Phaser): the
 * scene draws the farmer and calls update() every frame; a job's command is
 * sent to the game when the farmer finishes it.
 */
import type { Command } from '../../core';

export type JobIcon = 'plow' | 'plant' | 'harvest';

export interface Job {
  id: number;
  x: number;
  y: number;
  command: Command;
  icon: JobIcon;
  /** Painting: expected failures (already plowed...) stay silent. */
  quiet: boolean;
}

export type FarmerMode = 'idle' | 'walking' | 'working';

export interface FarmerPose {
  /** Position in tile units (fractional while walking). */
  x: number;
  y: number;
  /** +1 facing right on screen, -1 left. */
  facing: 1 | -1;
  mode: FarmerMode;
  /** The job being walked to or worked on. */
  job: Job | null;
  /** 0..1 progress of the current work. */
  work: number;
}

export interface QueueOptions {
  /** Tiles per second with an empty queue; long queues walk faster. */
  speed: number;
  /** Milliseconds of work per job with an empty queue; long queues work faster. */
  workMs: number;
  maxJobs: number;
  /** Sends the job's command. */
  execute: (job: Job) => void;
}

export type AddResult = 'queued' | 'duplicate' | 'full';

/** Where the farmer stands to work a tile: its front corner, so he's drawn in front of the crop. */
const STAND = 0.38;

export class FarmerQueue {
  readonly pose: FarmerPose;
  private queue: Job[] = [];
  private nextId = 1;
  private workLeft = 0;

  constructor(
    private readonly o: QueueOptions,
    start: { x: number; y: number },
  ) {
    this.pose = { x: start.x, y: start.y, facing: 1, mode: 'idle', job: null, work: 0 };
  }

  /** Jobs waiting, including the one in progress. */
  get jobs(): readonly Job[] {
    return this.pose.job ? [this.pose.job, ...this.queue] : this.queue;
  }

  get busy(): boolean {
    return this.pose.job !== null || this.queue.length > 0;
  }

  /** A job of this command type already waiting on this tile? */
  has(x: number, y: number, type?: Command['type']): boolean {
    return this.jobs.some((j) => j.x === x && j.y === y && (type === undefined || j.command.type === type));
  }

  add(job: Omit<Job, 'id'>): AddResult {
    if (this.has(job.x, job.y, job.command.type)) return 'duplicate';
    if (this.jobs.length >= this.o.maxJobs) return 'full';
    this.queue.push({ ...job, id: this.nextId++ });
    return 'queued';
  }

  /** Does every job right now (leaving a farm, going visiting, hiding the page). */
  flush(): void {
    const all = [...this.jobs];
    this.queue = [];
    this.pose.job = null;
    this.pose.mode = 'idle';
    for (const job of all) this.o.execute(job);
  }

  clear(): void {
    this.queue = [];
    this.pose.job = null;
    this.pose.mode = 'idle';
  }

  /** Moves the farmer on by `dtMs`, running any jobs he finishes. */
  update(dtMs: number): void {
    let dt = Math.max(0, Math.min(dtMs, 250)); // a long frame (tab switch) shouldn't teleport him
    const p = this.pose;
    while (dt > 0) {
      if (!p.job) {
        const next = this.queue.shift();
        if (!next) {
          p.mode = 'idle';
          return;
        }
        p.job = next;
        p.mode = 'walking';
        p.work = 0;
      }
      const job = p.job;
      const backlog = this.queue.length;
      if (p.mode === 'walking') {
        const tx = job.x + STAND;
        const ty = job.y + STAND;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.hypot(dx, dy);
        const speed = Math.min(this.o.speed * 2.5, this.o.speed + backlog * 0.4); // tiles per second
        const step = (speed * dt) / 1000;
        // Screen x grows with (x - y) in the iso projection.
        if (Math.abs(dx - dy) > 0.01) p.facing = dx - dy > 0 ? 1 : -1;
        if (step >= dist) {
          p.x = tx;
          p.y = ty;
          dt -= (dist / speed) * 1000;
          p.mode = 'working';
          this.workLeft = Math.max(this.o.workMs * 0.35, this.o.workMs - backlog * 8);
          p.work = 0;
        } else {
          p.x += (dx / dist) * step;
          p.y += (dy / dist) * step;
          dt = 0;
        }
      } else {
        const total = Math.max(this.o.workMs * 0.35, this.o.workMs - backlog * 8);
        const used = Math.min(dt, this.workLeft);
        this.workLeft -= used;
        dt -= used;
        p.work = 1 - this.workLeft / total;
        if (this.workLeft <= 0) {
          p.job = null;
          p.mode = 'idle';
          this.o.execute(job);
        }
      }
    }
  }
}
