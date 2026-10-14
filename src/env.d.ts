import type Phaser from 'phaser';
import type { GameApp } from './app/GameApp';
import type { Session } from './app/session';

declare global {
  interface Window {
    /** Dev builds only: the running Phaser game, for debugging. */
    __game?: Phaser.Game;
    /** Dev builds only: game transport and UI store, for debugging. */
    __session?: Session;
    /** Dev builds only: the app controller (farm list, saves). */
    __app?: GameApp;
  }
}
