/**
 * Installable, offline web app (PLAN.md Phase 7): service worker registration
 * with an "update ready" handshake, the browser's install prompt, and iOS
 * detection for the "Add to Home Screen" tip (iOS can clear a website's data
 * after about a week unused, but not an installed app's).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaCallbacks {
  /** A new version finished downloading; `apply` switches to it (the page reloads). */
  onUpdateReady(apply: () => void): void;
  /** The browser offers (or stops offering) to install the app. */
  onInstallable(available: boolean): void;
}

let installEvent: BeforeInstallPromptEvent | null = null;

export function setUpPwa(cb: PwaCallbacks): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    installEvent = e as BeforeInstallPromptEvent;
    cb.onInstallable(true);
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    cb.onInstallable(false);
  });

  // Dev builds don't use a service worker: Vite serves modules live.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => void registerWorker(cb).catch((e) => console.warn('Service worker registration failed', e));
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

async function registerWorker(cb: PwaCallbacks): Promise<void> {
  const reg = await navigator.serviceWorker.register('./sw.js');
  const ready = (worker: ServiceWorker) => cb.onUpdateReady(() => worker.postMessage('skip-waiting'));
  // A first install has no controller yet: nothing to update from.
  if (reg.waiting && navigator.serviceWorker.controller) ready(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) ready(worker);
    });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  // Look for a new version whenever the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
  });
}

/** Shows the browser's install dialog. Resolves true if the player installed. */
export async function promptInstall(): Promise<boolean> {
  const e = installEvent;
  if (!e) return false;
  installEvent = null;
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted';
}

/** iPhone, iPad or iPod (iPadOS reports itself as a Mac with touch). */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Running as an installed app rather than a browser tab. */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
