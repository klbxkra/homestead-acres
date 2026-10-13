import type Phaser from 'phaser';

declare global {
  interface Window {
    /** Dev builds only: the running Phaser game, for debugging. */
    __game?: Phaser.Game;
  }
}
