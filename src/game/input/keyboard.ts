/** Tracks held keys for smooth camera panning and fires one-shot shortcuts. */

export interface KeyboardHandlers {
  shortcut(key: string, e: KeyboardEvent): void;
}

const PAN_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export class KeyboardInput {
  private readonly held = new Set<string>();
  private readonly dispose: () => void;

  constructor(handlers: KeyboardHandlers) {
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;

    const onDown = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (PAN_KEYS.has(key)) {
        this.held.add(key);
        e.preventDefault();
        return;
      }
      if (!e.repeat) handlers.shortcut(key, e);
    };
    const onUp = (e: KeyboardEvent) => this.held.delete(e.key.toLowerCase());
    const onBlur = () => this.held.clear();

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    this.dispose = () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }

  /** Pan direction from held keys, each axis in -1..1. */
  panVector(): { x: number; y: number } {
    const h = this.held;
    const x = (h.has('d') || h.has('arrowright') ? 1 : 0) - (h.has('a') || h.has('arrowleft') ? 1 : 0);
    const y = (h.has('s') || h.has('arrowdown') ? 1 : 0) - (h.has('w') || h.has('arrowup') ? 1 : 0);
    return { x, y };
  }

  destroy(): void {
    this.dispose();
  }
}
