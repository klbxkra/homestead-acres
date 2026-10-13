import { expect } from 'vitest';
import { defaultContent } from '../../src/content';
import type { Content } from '../../src/content';
import {
  applyCommand,
  entityAt,
  HOUR_MS,
  newGame,
  rulesForPreset,
  tick,
} from '../../src/core';
import type {
  Command,
  CommandErrorCode,
  FarmState,
  GameEvent,
  GameState,
  PlayerState,
  PlotEntity,
  WorldRules,
} from '../../src/core';

export const T0 = Date.UTC(2026, 0, 1, 8, 0, 0);

/** Drives one game through commands and simulated real time. */
export class Harness {
  state: GameState;
  realNow = T0;
  lastEvents: GameEvent[] = [];
  readonly content: Content;

  constructor(rules: Partial<WorldRules> = {}, content: Content = defaultContent) {
    this.content = content;
    this.state = newGame(
      { farmName: 'Test Farm', playerName: 'Tester', realNow: T0, seed: 1, rules: { ...rulesForPreset('classic'), ...rules } },
      content,
    );
  }

  get player(): PlayerState {
    return this.state.players[this.state.localPlayerId]!;
  }

  get farm(): FarmState {
    return this.state.farms[this.state.homeFarmId]!;
  }

  get gameNow(): number {
    return this.state.clock.gameNow;
  }

  plot(x: number, y: number): PlotEntity | undefined {
    const e = entityAt(this.farm, x, y, this.content);
    return e?.kind === 'plot' ? e : undefined;
  }

  /** Advances real time, ticking in small steps (like a running game) unless `asOneGap`. */
  advance(ms: number, { asOneGap = false } = {}): void {
    if (asOneGap) {
      this.realNow += ms;
      this.state = tick(this.state, this.realNow);
      return;
    }
    const step = 30_000;
    let left = ms;
    while (left > 0) {
      const d = Math.min(step, left);
      this.realNow += d;
      left -= d;
      this.state = tick(this.state, this.realNow);
    }
  }

  advanceHours(h: number): void {
    this.advance(h * HOUR_MS, { asOneGap: true });
  }

  run(command: Command) {
    return applyCommand(
      this.state,
      { playerId: this.state.localPlayerId, farmId: this.state.homeFarmId, command },
      this.realNow,
      this.content,
    );
  }

  ok(command: Command): GameEvent[] {
    const result = this.run(command);
    if (!result.ok) throw new Error(`Expected ${command.type} to succeed, got ${result.error.code}: ${result.error.message}`);
    this.state = result.state;
    this.lastEvents = result.events;
    return result.events;
  }

  fails(command: Command, code: CommandErrorCode): void {
    const before = this.state;
    const result = this.run(command);
    expect(result.ok, `expected ${command.type} to fail with ${code}`).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
    expect(result.state).toBe(before); // rejected commands never change state
  }
}
