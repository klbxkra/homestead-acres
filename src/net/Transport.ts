import type { Content } from '../content';
import type { Command, CommandError, FarmId, GameEvent, GameState, PlayerId } from '../core';

export type SendResult = { ok: true; events: GameEvent[] } | { ok: false; error: CommandError };

export type StateListener = (state: GameState, events: readonly GameEvent[]) => void;

/**
 * The only way the UI and renderer change the game (PLAN.md section 9).
 * Single-player uses LocalTransport; co-op will add a WebSocket transport
 * with the same interface (optimistic local apply, reconciled by the host).
 */
export interface Transport {
  readonly content: Content;
  readonly playerId: PlayerId;
  getState(): GameState;
  send(command: Command, farmId?: FarmId): SendResult;
  /** Advance time to `realNow` (called by the game loop and on resume). */
  tick(realNow: number): void;
  subscribe(listener: StateListener): () => void;
  /**
   * Whole-state replacement (a different farm was loaded; in co-op, a resync from
   * the host). Fires before the regular subscribers see the new state.
   */
  subscribeReset(listener: (state: GameState) => void): () => void;
}
