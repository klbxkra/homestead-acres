/**
 * Page lifecycle hooks (PLAN.md section 8). Mobile browsers kill background tabs
 * without warning and `beforeunload` is unreliable there, so saving keys off
 * `visibilitychange` (async is usually fine) and `pagehide` (last chance; sync only).
 */

export interface LifecycleHandlers {
  /** Tab hidden, app switched, screen locked. Async work usually completes. */
  hidden(): void;
  /** Back in the foreground. */
  visible(): void;
  /** Page is being unloaded or frozen. Only synchronous work is guaranteed. */
  leaving(): void;
}

export function watchLifecycle(handlers: LifecycleHandlers): () => void {
  const onVisibility = () => (document.visibilityState === 'hidden' ? handlers.hidden() : handlers.visible());
  const onPageHide = () => handlers.leaving();
  const onFreeze = () => handlers.leaving();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('freeze', onFreeze);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('freeze', onFreeze);
  };
}

export function isPageVisible(): boolean {
  return document.visibilityState !== 'hidden';
}
