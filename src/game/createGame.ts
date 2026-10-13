import Phaser from 'phaser';
import { FarmScene } from './scenes/FarmScene';
import { onViewportResize, renderPixelRatio, viewportSize } from '../platform/device';

/**
 * Creates the Phaser game. The canvas is sized in device pixels (capped DPR) and
 * shrunk back to CSS size with the scale manager's zoom, so it stays sharp on
 * high-density screens. Scale mode NONE because we drive resizing ourselves.
 */
export function createGame(parent: HTMLElement): Phaser.Game {
  const ratio = renderPixelRatio();
  const { width, height } = viewportSize();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: width * ratio,
    height: height * ratio,
    backgroundColor: '#3d6b2a',
    scene: [FarmScene],
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: 1 / ratio,
    },
    input: {
      activePointers: 3, // room for pinch-zoom in Phase 2
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
    game.scale.resize(size.width * r, size.height * r);
    game.scale.setZoom(1 / r);
    farmScene(game)?.setPixelRatio(r);
  };

  game.events.once(Phaser.Core.Events.READY, resize);
  onViewportResize(resize);

  if (import.meta.env.DEV) window.__game = game; // for console debugging and automated checks

  return game;
}

function farmScene(game: Phaser.Game): FarmScene | undefined {
  const scene = game.scene.getScene('Farm');
  return scene instanceof FarmScene && scene.sys.isActive() ? scene : undefined;
}
