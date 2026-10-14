import { render, h } from 'preact';
import type Phaser from 'phaser';
import { GameApp } from './app/GameApp';
import type { RendererHooks } from './app/GameApp';
import { defaultContent } from './content';
import { createGame, farmScene } from './game/createGame';
import { createEmergencyStore, IdbSaveStore, MemorySaveStore } from './persistence';
import type { SaveStore } from './persistence';
import { suppressBrowserGestures, whenViewportReady } from './platform/device';
import { App } from './ui/App';

suppressBrowserGestures();

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
const gameApp = new GameApp({ saves, emergency: createEmergencyStore(), content: defaultContent, renderer, storageWarning: warning });
gameApp.attachLifecycle();
render(h(App, { gameApp }), uiRoot);
await gameApp.init();

if (import.meta.env.DEV) window.__app = gameApp;
