import type { Content } from '../content';
import { applyCommand, tick } from '../core';
import type { Command, FarmId, GameEvent, GameState } from '../core';
import type { SendResult, StateListener, Transport } from './Transport';

/** Applies commands directly to an in-memory game state. */
export class LocalTransport implements Transport {
  readonly content: Content;
  private state: GameState;
  private readonly now: () => number;
  private readonly listeners = new Set<StateListener>();
  private readonly resetListeners = new Set<(state: GameState) => void>();

  constructor(state: GameState, content: Content, now: () => number) {
    this.state = state;
    this.content = content;
    this.now = now;
  }

  get playerId(): string {
    return this.state.localPlayerId;
  }

  getState(): GameState {
    return this.state;
  }

  send(command: Command, farmId: FarmId = this.state.homeFarmId): SendResult {
    const result = applyCommand(this.state, { playerId: this.playerId, farmId, command }, this.now(), this.content);
    if (!result.ok) return { ok: false, error: result.error };
    this.state = result.state;
    this.emit(result.events);
    return { ok: true, events: result.events };
  }

  tick(realNow: number): void {
    const next = tick(this.state, realNow, this.content);
    if (next === this.state) return;
    this.state = next;
    this.emit([]);
  }

  /** Replace the whole state (loading a save). */
  replaceState(state: GameState): void {
    this.state = state;
    for (const l of [...this.resetListeners]) l(state);
    this.emit([]);
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeReset(listener: (state: GameState) => void): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  private emit(events: readonly GameEvent[]): void {
    for (const l of [...this.listeners]) l(this.state, events);
  }
}
