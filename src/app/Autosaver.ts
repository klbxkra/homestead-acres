import type { GameState } from '../core';
import type { Transport } from '../net/Transport';
import type { EmergencyStore, SaveStore, SlotMeta } from '../persistence';
import { encodeSave } from '../persistence';

/** Save this long after the last change, so a burst of actions becomes one write. */
export const SAVE_DEBOUNCE_MS = 2_000;
/** Also save on this interval even without actions, keeping the offline-time anchor fresh. */
export const AUTOSAVE_INTERVAL_MS = 30_000;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface TimerApi {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface AutosaverOptions {
  transport: Transport;
  store: SaveStore;
  emergency: EmergencyStore;
  slotId: string;
  meta: SlotMeta;
  now: () => number;
  /**
   * Back up whatever is on disk before the first write of the session (default true).
   * False after restoring from a backup: the copy on disk is the damaged one.
   */
  backupOnFirstWrite?: boolean;
  timers?: TimerApi;
  onStatus?: (status: SaveStatus, lastSavedAt: number | null, error?: unknown) => void;
}

const browserTimers: TimerApi = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

/** Keeps one slot saved while it's being played (PLAN.md section 7, "When to save"). */
export class Autosaver {
  private readonly o: AutosaverOptions;
  private readonly timers: TimerApi;
  private meta: SlotMeta;
  private lastSaved: GameState | null = null;
  private lastSavedAt: number | null = null;
  private debounce: unknown = null;
  private interval: unknown = null;
  private unsubscribe: (() => void) | null = null;
  /** Writes run one at a time, in order. */
  private chain: Promise<void> = Promise.resolve();
  private firstWrite = true;
  private activeSince: number | null = null;

  constructor(options: AutosaverOptions) {
    this.o = options;
    this.timers = options.timers ?? browserTimers;
    this.meta = { ...options.meta };
  }

  start(): void {
    this.activeSince = this.o.now();
    this.unsubscribe = this.o.transport.subscribe((_state, events) => {
      if (events.length > 0) this.scheduleSave();
    });
    this.interval = this.timers.setInterval(() => void this.saveIfChanged(), AUTOSAVE_INTERVAL_MS);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.interval !== null) this.timers.clearInterval(this.interval);
    if (this.debounce !== null) this.timers.clearTimeout(this.debounce);
    this.interval = this.debounce = null;
  }

  /** Pause playtime counting (tab hidden). */
  pausePlaytime(): void {
    this.accumulatePlaytime();
    this.activeSince = null;
  }

  resumePlaytime(): void {
    if (this.activeSince === null) this.activeSince = this.o.now();
  }

  /** Save now and wait for it (and any earlier write) to finish. */
  saveNow(): Promise<void> {
    if (this.debounce !== null) this.timers.clearTimeout(this.debounce);
    this.debounce = null;
    const run = this.chain.then(() => this.write());
    this.chain = run.catch(() => undefined);
    return run;
  }

  /**
   * Save unless nothing at all changed since the last write. While the game is
   * open the clock always moves, so this saves on every interval, which keeps the
   * offline-progress anchor recent if the tab is later killed without warning.
   */
  saveIfChanged(): Promise<void> {
    this.o.transport.tick(this.o.now());
    return this.o.transport.getState() === this.lastSaved ? this.chain : this.saveNow();
  }

  /**
   * Synchronous last-chance copy for `pagehide`, when an async IndexedDB write
   * may never finish. loadSlot() uses it only if it's newer than the main save.
   */
  saveEmergencyCopy(): void {
    const now = this.o.now();
    this.o.transport.tick(now);
    this.o.emergency.write(this.o.slotId, encodeSave(this.o.transport.getState(), now));
  }

  get lastSavedTime(): number | null {
    return this.lastSavedAt;
  }

  private scheduleSave(): void {
    if (this.debounce !== null) this.timers.clearTimeout(this.debounce);
    this.debounce = this.timers.setTimeout(() => {
      this.debounce = null;
      void this.saveNow().catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
  }

  private async write(): Promise<void> {
    const now = this.o.now();
    this.o.transport.tick(now); // stamp the clock anchor at the moment of saving
    const state = this.o.transport.getState();
    this.accumulatePlaytime();
    const player = state.players[state.localPlayerId]!;
    const farm = state.farms[state.homeFarmId]!;
    const meta: SlotMeta = {
      ...this.meta,
      farmName: farm.name,
      playerName: player.name,
      level: player.level,
      coins: player.coins,
      lastSavedAt: now,
    };
    this.o.onStatus?.('saving', this.lastSavedAt);
    try {
      // The first write of a session backs up what was on disk before it (unless that copy was damaged).
      const keepDisk = this.o.backupOnFirstWrite ?? true;
      await this.o.store.write(this.o.slotId, encodeSave(state, now), meta, {
        forceBackup: this.firstWrite && keepDisk,
        skipBackup: this.firstWrite && !keepDisk,
      });
      this.firstWrite = false;
      this.meta = meta;
      this.lastSaved = state;
      this.lastSavedAt = now;
      this.o.emergency.clear(this.o.slotId);
      this.o.onStatus?.('saved', now);
    } catch (error) {
      this.o.onStatus?.('error', this.lastSavedAt, error);
      throw error;
    }
  }

  private accumulatePlaytime(): void {
    if (this.activeSince === null) return;
    const now = this.o.now();
    this.meta = { ...this.meta, playtimeMs: this.meta.playtimeMs + Math.max(0, now - this.activeSince) };
    this.activeSince = now;
  }
}
