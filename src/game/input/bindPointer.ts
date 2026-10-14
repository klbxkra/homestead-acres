import { GestureRecognizer } from './gestures';
import type { GestureHandlers, PointerInput, PointerKind, Pt } from './gestures';

export interface PointerBindingHandlers extends GestureHandlers {
  /** deltaY > 0 = zoom out. */
  wheel(deltaY: number, p: Pt): void;
  /** Pointer left the canvas (hide hover highlights). */
  leave(): void;
}

/** Feeds DOM pointer events on `el` into a GestureRecognizer. Coordinates are CSS px relative to `el`. */
export function bindPointer(el: HTMLElement, handlers: PointerBindingHandlers): () => void {
  const recognizer = new GestureRecognizer(handlers, {
    set: (fn, ms) => window.setTimeout(fn, ms),
    clear: (h) => window.clearTimeout(h as number),
  });

  if (import.meta.env.DEV) (window as unknown as { __gestures: GestureRecognizer }).__gestures = recognizer;

  const toInput = (e: PointerEvent): PointerInput => {
    const rect = el.getBoundingClientRect();
    return {
      id: e.pointerId,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pointerType: (['mouse', 'touch', 'pen'].includes(e.pointerType) ? e.pointerType : 'mouse') as PointerKind,
      button: e.button,
      buttons: e.buttons,
      shiftKey: e.shiftKey,
    };
  };

  const onDown = (e: PointerEvent) => {
    try {
      el.setPointerCapture(e.pointerId); // keep receiving moves when the finger leaves the canvas
    } catch {
      // Throws for pointers the browser no longer tracks (or synthetic events); capture is optional.
    }
    recognizer.down(toInput(e));
  };
  const onMove = (e: PointerEvent) => recognizer.move(toInput(e));
  const onUp = (e: PointerEvent) => recognizer.up(toInput(e));
  const onCancel = (e: PointerEvent) => recognizer.cancel(toInput(e));
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') handlers.leave();
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    handlers.wheel(e.deltaY, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('pointerleave', onLeave);
    el.removeEventListener('wheel', onWheel);
  };
}
