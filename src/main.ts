import { render, h } from 'preact';
import type Phaser from 'phaser';
import { GameApp } from './app/GameApp';
import type { RendererHooks } from './app/GameApp';
import { defaultContent } from './content';
import { createGame, farmScene } from './game/createGame';
import { createSettingsStore } from './app/settings';
import { createEmergencyStore, IdbSaveStore, localSettingsPersistence, MemorySaveStore, safeLocalStorage } from './persistence';
import type { SaveStore } from './persistence';
import { TutorialProgress } from './app/tutorial';
import { createAudio } from './platform/audio';
import { suppressBrowserGestures, whenViewportReady } from './platform/device';
import { setUpPwa } from './platform/pwa';
import { App } from './ui/App';

suppressBrowserGestures();

// Browsers only allow sound after a tap or key press; every gesture also resumes audio iOS paused.
const audio = createAudio();
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => audio.unlock(), { capture: true });
// A soft click for buttons in menus and panels.
document.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('button:not(:disabled)')) audio.play('tap');
});

const gameRoot = document.getElementById('game');
const uiRoot = document.getElementById('ui');
if (!gameRoot || !uiRoot) throw new Error('index.html is missing #game or #ui');
const gameEl = gameRoot;

/** The Phaser game is created the first time a farm opens and paused while the farm list shows. */
let game: Phaser.Game | null = null;
let paused = false;
const renderer: RendererHooks = {
  start(session) {
    void whenViewportReady().then(() => {
      game = createGame(gameEl, session);
      if (paused) renderer.pause();
    });
  },
  pause() {
    paused = true;
    game?.loop.sleep();
    if (game) farmScene(game)?.setInputEnabled(false);
  },
  resume() {
    paused = false;
    game?.loop.wake();
    if (game) farmScene(game)?.setInputEnabled(true);
  },
  flush() {
    if (game) farmScene(game)?.flushJobs();
  },
};

async function openSaveStore(): Promise<{ saves: SaveStore; warning: string | null }> {
  const idb = new IdbSaveStore();
  try {
    await idb.ready();
    return { saves: idb, warning: null };
  } catch (e) {
    console.warn('IndexedDB unavailable, saves will only last for this tab', e);
    return {
      saves: new MemorySaveStore(),
      warning: 'This browser is blocking storage (private mode?), so farms will be lost when the tab closes. Use Export to keep a copy.',
    };
  }
}

const { saves, warning } = await openSaveStore();
const gameApp = new GameApp({
  saves,
  emergency: createEmergencyStore(),
  content: defaultContent,
  renderer,
  storageWarning: warning,
  settings: createSettingsStore(localSettingsPersistence()),
  audio,
  tutorial: new TutorialProgress(safeLocalStorage()),
});
gameApp.attachLifecycle();
setUpPwa({
  onUpdateReady: (apply) => gameApp.setUpdateReady(apply),
  onInstallable: (available) => gameApp.setCanInstall(available),
});
render(h(App, { gameApp }), uiRoot);
await gameApp.init();

if (import.meta.env.DEV) window.__app = gameApp;
