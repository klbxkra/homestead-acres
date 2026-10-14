import { beforeEach, describe, expect, it } from 'vitest';
import { GestureRecognizer, LONG_PRESS_MS } from '../../src/game/input/gestures';
import type { DragMode, GestureHandlers, PointerInput, PointerKind } from '../../src/game/input/gestures';

/** Manual clock for the long-press timer. */
class FakeTimers {
  now = 0;
  private tasks: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  set = (fn: () => void, ms: number) => {
    const id = this.nextId++;
    this.tasks.push({ at: this.now + ms, fn, id });
    return id;
  };
  clear = (id: unknown) => {
    this.tasks = this.tasks.filter((t) => t.id !== id);
  };
  advance(ms: number) {
    this.now += ms;
    const due = this.tasks.filter((t) => t.at <= this.now);
    this.tasks = this.tasks.filter((t) => t.at > this.now);
    due.forEach((t) => t.fn());
  }
}

let log: string[];
let timers: FakeTimers;
let dragMode: DragMode;
let g: GestureRecognizer;

const handlers: GestureHandlers = {
  tap: (p) => log.push(`tap ${p.x},${p.y}`),
  longPress: (p) => log.push(`long ${p.x},${p.y}`),
  hover: (p) => log.push(`hover ${p.x},${p.y}`),
  chooseDragMode: () => dragMode,
  dragStart: (p, mode) => log.push(`start ${mode} ${p.x},${p.y}`),
  dragMove: (p, d, mode) => log.push(`move ${mode} ${p.x},${p.y} d${d.x},${d.y}`),
  dragEnd: (p, mode) => log.push(`end ${mode} ${p.x},${p.y}`),
  pinch: (scale, c) => log.push(`pinch ${scale.toFixed(2)} ${c.x},${c.y}`),
};

function ptr(id: number, x: number, y: number, pointerType: PointerKind = 'touch', buttons = 1): PointerInput {
  return { id, x, y, pointerType, button: 0, buttons, shiftKey: false };
}

beforeEach(() => {
  log = [];
  timers = new FakeTimers();
  dragMode = 'pan';
  g = new GestureRecognizer(handlers, timers);
});

describe('GestureRecognizer', () => {
  it('reports a quick press as a tap at the press point', () => {
    g.down(ptr(1, 100, 100));
    g.move(ptr(1, 103, 102)); // within the touch threshold
    g.up(ptr(1, 103, 102));
    expect(log).toEqual(['tap 100,100']);
  });

  it('reports a still press past the delay as a long-press, with no tap on release', () => {
    g.down(ptr(1, 50, 60));
    timers.advance(LONG_PRESS_MS);
    g.up(ptr(1, 50, 60));
    expect(log).toEqual(['long 50,60']);
  });

  it('starts a drag once the pointer passes the threshold, and cancels the long-press', () => {
    g.down(ptr(1, 0, 0));
    g.move(ptr(1, 20, 0));
    timers.advance(LONG_PRESS_MS * 2);
    g.move(ptr(1, 30, 5));
    g.up(ptr(1, 30, 5));
    expect(log).toEqual(['start pan 0,0', 'move pan 20,0 d20,0', 'move pan 30,5 d10,5', 'end pan 30,5']);
  });

  it('still drags after a long-press when the pointer then moves (press, pause, drag)', () => {
    dragMode = 'paint';
    g.down(ptr(1, 0, 0));
    timers.advance(LONG_PRESS_MS + 100);
    g.move(ptr(1, 40, 0));
    g.up(ptr(1, 40, 0));
    expect(log).toEqual(['long 0,0', 'start paint 0,0', 'move paint 40,0 d40,0', 'end paint 40,0']);
  });

  it('uses the drag mode chosen at drag start', () => {
    dragMode = 'ghost';
    g.down(ptr(1, 0, 0));
    g.move(ptr(1, 0, 30));
    dragMode = 'pan'; // changing the answer mid-drag must not matter
    g.move(ptr(1, 0, 40));
    g.up(ptr(1, 0, 40));
    expect(log[0]).toBe('start ghost 0,0');
    expect(log.at(-1)).toBe('end ghost 0,40');
  });

  it('turns two fingers into a pinch, ending any drag first, and never taps afterwards', () => {
    g.down(ptr(1, 100, 100));
    g.move(ptr(1, 120, 100)); // drag started
    g.down(ptr(2, 220, 100)); // distance 100
    g.move(ptr(2, 320, 100)); // distance 200 -> scale 2
    g.up(ptr(1, 120, 100));
    g.move(ptr(2, 330, 100)); // remaining finger does nothing
    g.up(ptr(2, 330, 100));
    expect(log).toEqual(['start pan 100,100', 'move pan 120,100 d20,0', 'end pan 120,100', 'pinch 2.00 220,100']);
  });

  it('reports hover only for a mouse with no buttons held', () => {
    g.move(ptr(9, 5, 5, 'mouse', 0));
    g.move(ptr(9, 6, 6, 'mouse', 1));
    g.move(ptr(9, 7, 7, 'touch', 0));
    expect(log).toEqual(['hover 5,5']);
  });

  it('ends a drag on cancel without tapping', () => {
    g.down(ptr(1, 0, 0));
    g.move(ptr(1, 50, 0));
    g.cancel(ptr(1, 50, 0));
    g.down(ptr(1, 10, 10));
    g.up(ptr(1, 10, 10));
    expect(log).toEqual(['start pan 0,0', 'move pan 50,0 d50,0', 'end pan 50,0', 'tap 10,10']);
  });

  it('uses a smaller drag threshold for the mouse than for touch', () => {
    g.down(ptr(1, 0, 0, 'mouse'));
    g.move(ptr(1, 6, 0, 'mouse'));
    g.up(ptr(1, 6, 0, 'mouse'));
    expect(log[0]).toBe('start pan 0,0');

    log = [];
    g.down(ptr(2, 0, 0, 'touch'));
    g.move(ptr(2, 6, 0, 'touch'));
    g.up(ptr(2, 6, 0, 'touch'));
    expect(log).toEqual(['tap 0,0']);
  });
});
