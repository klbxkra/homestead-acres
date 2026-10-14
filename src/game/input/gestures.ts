/**
 * Unified gesture recognizer (PLAN.md section 8). Turns raw pointer events from
 * mouse, touch or pen into tap / long-press / drag / pinch / hover. It is pure
 * (timers are injected), so it can be unit-tested without a browser.
 */

export interface Pt {
  x: number;
  y: number;
}

export type PointerKind = 'mouse' | 'touch' | 'pen';

export interface PointerInput extends Pt {
  id: number;
  pointerType: PointerKind;
  /** Button that changed (0 primary, 1 middle, 2 secondary). */
  button: number;
  /** Bitmask of held buttons. */
  buttons: number;
  shiftKey: boolean;
}

/**
 * pan: move the camera.
 * paint: apply the tool to every tile crossed.
 * ghost: drag a held item; releasing drops it there.
 */
export type DragMode = 'pan' | 'paint' | 'ghost';

export interface PressInfo {
  pointerType: PointerKind;
  button: number;
  shiftKey: boolean;
}

export interface GestureHandlers {
  tap(p: Pt, info: PressInfo): void;
  longPress(p: Pt, info: PressInfo): void;
  hover(p: Pt): void;
  /** Decides what a one-pointer drag does, at the moment it starts. */
  chooseDragMode(start: Pt, info: PressInfo): DragMode;
  dragStart(start: Pt, mode: DragMode): void;
  dragMove(p: Pt, delta: Pt, mode: DragMode): void;
  dragEnd(p: Pt, mode: DragMode): void;
  /** scale: change since the last pinch event; center/centerDelta in the same space as pointer coords. */
  pinch(scale: number, center: Pt, centerDelta: Pt): void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const LONG_PRESS_MS = 400;
export const DRAG_THRESHOLD = { mouse: 4, touch: 10, pen: 6 } as const;

/**
 * pressing: one pointer down, not yet moved far.
 * held: long-press fired; moving now still starts a drag (press, pause, then drag is common).
 * done: a pinch ended; ignore the remaining finger until everything is released.
 */
type Phase = 'idle' | 'pressing' | 'held' | 'dragging' | 'pinching' | 'done';

export class GestureRecognizer {
  private readonly handlers: GestureHandlers;
  private readonly timers: Timers;
  private readonly pointers = new Map<number, Pt>();
  private phase: Phase = 'idle';
  private start: Pt = { x: 0, y: 0 };
  private last: Pt = { x: 0, y: 0 };
  private info: PressInfo = { pointerType: 'mouse', button: 0, shiftKey: false };
  private mode: DragMode = 'pan';
  private pressTimer: unknown = null;
  private pinchDist = 0;
  private pinchCenter: Pt = { x: 0, y: 0 };

  constructor(handlers: GestureHandlers, timers: Timers) {
    this.handlers = handlers;
    this.timers = timers;
  }

  down(e: PointerInput): void {
    if (this.pointers.size >= 2) return; // ignore a third finger
    this.pointers.set(e.id, { x: e.x, y: e.y });

    if (this.pointers.size === 1) {
      this.phase = 'pressing';
      this.start = { x: e.x, y: e.y };
      this.last = this.start;
      this.info = { pointerType: e.pointerType, button: e.button, shiftKey: e.shiftKey };
      this.pressTimer = this.timers.set(() => this.onLongPress(), LONG_PRESS_MS);
      return;
    }

    // Second pointer: whatever one-finger gesture was happening becomes a pinch.
    this.clearPressTimer();
    if (this.phase === 'dragging') this.handlers.dragEnd(this.last, this.mode);
    this.phase = 'pinching';
    const [a, b] = this.twoPointers();
    this.pinchDist = distance(a, b);
    this.pinchCenter = midpoint(a, b);
  }

  move(e: PointerInput): void {
    if (!this.pointers.has(e.id)) {
      if (this.pointers.size === 0 && e.pointerType === 'mouse' && e.buttons === 0) this.handlers.hover(e);
      return;
    }
    const p = { x: e.x, y: e.y };
    this.pointers.set(e.id, p);

    switch (this.phase) {
      case 'pressing':
      case 'held': {
        if (distance(p, this.start) <= DRAG_THRESHOLD[this.info.pointerType]) return;
        this.clearPressTimer();
        this.phase = 'dragging';
        this.mode = this.handlers.chooseDragMode(this.start, this.info);
        this.handlers.dragStart(this.start, this.mode);
        this.handlers.dragMove(p, sub(p, this.start), this.mode);
        this.last = p;
        return;
      }
      case 'dragging':
        this.handlers.dragMove(p, sub(p, this.last), this.mode);
        this.last = p;
        return;
      case 'pinching': {
        if (this.pointers.size < 2) return;
        const [a, b] = this.twoPointers();
        const dist = distance(a, b);
        const center = midpoint(a, b);
        const scale = this.pinchDist > 0 ? dist / this.pinchDist : 1;
        this.handlers.pinch(scale, center, sub(center, this.pinchCenter));
        this.pinchDist = dist;
        this.pinchCenter = center;
        return;
      }
      default:
        return;
    }
  }

  up(e: PointerInput): void {
    if (!this.pointers.has(e.id)) return;
    this.pointers.delete(e.id);
    const p = { x: e.x, y: e.y };

    if (this.phase === 'pressing') {
      this.clearPressTimer();
      this.handlers.tap(this.start, this.info);
      this.phase = 'idle';
    } else if (this.phase === 'dragging') {
      this.handlers.dragEnd(p, this.mode);
      this.phase = 'idle';
    } else if (this.phase === 'pinching') {
      this.phase = 'done'; // wait for the other finger without starting a new gesture
    }
    // 'held' releases without a tap: the long-press already handled it.
    if (this.pointers.size === 0) this.phase = 'idle';
  }

  cancel(e: PointerInput): void {
    if (!this.pointers.has(e.id)) return;
    this.pointers.delete(e.id);
    this.clearPressTimer();
    if (this.phase === 'dragging') this.handlers.dragEnd(this.last, this.mode);
    this.phase = this.pointers.size === 0 ? 'idle' : 'done';
  }

  private onLongPress(): void {
    this.pressTimer = null;
    if (this.phase !== 'pressing') return;
    this.phase = 'held';
    this.handlers.longPress(this.start, this.info);
  }

  private clearPressTimer(): void {
    if (this.pressTimer !== null) this.timers.clear(this.pressTimer);
    this.pressTimer = null;
  }

  private twoPointers(): [Pt, Pt] {
    const [a, b] = [...this.pointers.values()];
    return [a ?? this.start, b ?? this.start];
  }
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}
