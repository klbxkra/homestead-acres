import Phaser from 'phaser';
import type { Session } from '../app/session';
import { FarmScene } from './scenes/FarmScene';
import { onViewportResize, renderPixelRatio, viewportSize } from '../platform/device';

/**
 * Creates the Phaser game. The canvas is sized in device pixels (capped DPR) and
 * shrunk back to CSS size with the scale manager's zoom, so it stays sharp on
 * high-density screens. Scale mode NONE because we drive resizing ourselves.
 * Phaser's own input is off: game/input/ handles mouse, touch and keyboard.
 */
export function createGame(parent: HTMLElement, session: Session): Phaser.Game {
  const ratio = renderPixelRatio();
  const { width, height } = viewportSize();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: width * ratio,
    height: height * ratio,
    backgroundColor: '#3d6b2a',
    scene: [new FarmScene(session)],
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: 1 / ratio,
    },
    input: {
      keyboard: false,
      mouse: false,
      touch: false,
      gamepad: false,
    },
    render: {
      antialias: true,
      powerPreference: 'high-performance',
    },
  });

  const resize = () => {
    const r = renderPixelRatio();
    const size = viewportSize();
    if (size.width === 0 || size.height === 0) return; // hidden tab; keep the last good size
    const scene = farmScene(game);
    const center = scene?.screenCenterWorld();
    game.scale.resize(size.width * r, size.height * r);
    game.scale.setZoom(1 / r);
    scene?.setPixelRatio(r, center);
  };

  game.events.once(Phaser.Core.Events.READY, resize);
  onViewportResize(resize);

  if (import.meta.env.DEV) {
    // For console debugging and automated checks.
    window.__game = game;
    window.__session = session;
  }

  return game;
}

export function farmScene(game: Phaser.Game): FarmScene | undefined {
  const scene = game.scene.getScene('Farm');
  return scene instanceof FarmScene && scene.sys.isActive() ? scene : undefined;
}
