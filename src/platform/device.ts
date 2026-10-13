import { MAX_DEVICE_PIXEL_RATIO } from '../config';

export function renderPixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
}

export function isTouchPrimary(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

export function viewportSize(): { width: number; height: number } {
  // visualViewport tracks the real visible area on mobile (address bar, keyboard).
  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

/**
 * Resolves once the viewport has a usable size. A page opened in a background tab
 * (or a hidden webview) can report 0x0, and WebGL cannot create a 0x0 framebuffer.
 */
export function whenViewportReady(): Promise<void> {
  const ready = () => {
    const { width, height } = viewportSize();
    return width > 0 && height > 0;
  };
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (!ready()) return;
      stop();
      document.removeEventListener('visibilitychange', check);
      resolve();
    };
    const stop = onViewportResize(check);
    document.addEventListener('visibilitychange', check);
  });
}

export function onViewportResize(callback: () => void): () => void {
  window.addEventListener('resize', callback);
  window.addEventListener('orientationchange', callback);
  window.visualViewport?.addEventListener('resize', callback);
  return () => {
    window.removeEventListener('resize', callback);
    window.removeEventListener('orientationchange', callback);
    window.visualViewport?.removeEventListener('resize', callback);
  };
}

/** Stop the browser from hijacking game gestures (context menu, iOS pinch-zoom of the page). */
export function suppressBrowserGestures(): void {
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
}
