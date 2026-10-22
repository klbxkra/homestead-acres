import { describe, expect, it } from 'vitest';
import { FarmerQueue } from '../../src/game/queue/farmerQueue';
import type { Job } from '../../src/game/queue/farmerQueue';

function setup(maxJobs = 10) {
  const done: Job[] = [];
  const q = new FarmerQueue({ speed: 10, workMs: 200, maxJobs, execute: (j) => done.push(j) }, { x: 0, y: 0 });
  const plow = (x: number, y: number) => q.add({ x, y, command: { type: 'plow', x, y }, icon: 'plow', quiet: false });
  return { q, done, plow };
}

describe('farmer action queue', () => {
  it('walks to each job in order and runs it after the work time', () => {
    const { q, done, plow } = setup();
    plow(3, 0);
    plow(0, 4);
    q.update(100); // 1 tile walked of ~3
    expect(q.pose.mode).toBe('walking');
    expect(done).toHaveLength(0);
    q.update(300); // arrived, working
    expect(q.pose.mode).toBe('working');
    q.update(250);
    expect(done.map((j) => [j.x, j.y])).toEqual([[3, 0]]);
    for (let i = 0; i < 20; i++) q.update(100);
    expect(done.map((j) => [j.x, j.y])).toEqual([
      [3, 0],
      [0, 4],
    ]);
    expect(q.busy).toBe(false);
    expect(q.pose.mode).toBe('idle');
  });

  it('ignores a second job of the same kind on a tile, but allows plow then plant', () => {
    const { q, plow } = setup();
    expect(plow(2, 2)).toBe('queued');
    expect(plow(2, 2)).toBe('duplicate');
    expect(q.add({ x: 2, y: 2, command: { type: 'plant', x: 2, y: 2, cropId: 'strawberry' }, icon: 'plant', quiet: false })).toBe('queued');
    expect(q.has(2, 2, 'plant')).toBe(true);
  });

  it('refuses jobs past the limit', () => {
    const { plow } = setup(2);
    plow(1, 1);
    plow(2, 2);
    expect(plow(3, 3)).toBe('full');
  });

  it('flush runs everything at once, including the job in progress', () => {
    const { q, done, plow } = setup();
    plow(5, 5);
    plow(6, 6);
    q.update(100);
    q.flush();
    expect(done).toHaveLength(2);
    expect(q.busy).toBe(false);
  });

  it('works faster with a long queue', () => {
    const time = (jobs: number) => {
      const { q, done, plow } = setup(100);
      for (let i = 0; i < jobs; i++) plow(i % 10, Math.floor(i / 10));
      let ms = 0;
      while (done.length < jobs && ms < 600_000) {
        q.update(16);
        ms += 16;
      }
      return ms / jobs;
    };
    expect(time(40)).toBeLessThan(time(2));
  });

  it("doesn't jump across the farm after a long pause", () => {
    const { q, plow } = setup();
    plow(9, 9);
    q.update(10_000);
    expect(Math.hypot(q.pose.x, q.pose.y)).toBeLessThan(10 * 0.25 + 0.01);
  });

  it('faces the way he walks on screen', () => {
    const { q, plow } = setup();
    plow(0, 6); // screen left
    q.update(50);
    expect(q.pose.facing).toBe(-1);
  });
});
