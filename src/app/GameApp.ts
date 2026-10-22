/**
 * App controller: the farm list, opening/creating/exiting farms, autosave,
 * offline catch-up, export/import and page-lifecycle handling (PLAN.md Phase 3).
 */
import type { Content } from '../content';
import { newGame, tick, validateRules } from '../core';
import type { GameState, PresetId, WorldRules } from '../core';
import { LocalTransport } from '../net/LocalTransport';
import type { SendResult } from '../net/Transport';
import { decodeSave, encodeSave, loadSlot } from '../persistence';
import type { EmergencyStore, SaveStore, SlotMeta } from '../persistence';
import { silentAudio } from '../platform/audio';
import type { GameAudio } from '../platform/audio';
import { downloadTextFile, safeFileName } from '../platform/files';
import { watchLifecycle } from '../platform/lifecycle';
import { requestPersistentStorage } from '../platform/storage';
import { Autosaver } from './Autosaver';
import type { SaveStatus } from './Autosaver';
import { isNoteworthy, summarizeAway } from './awaySummary';
import type { AwaySummary } from './awaySummary';
import type { Session } from './session';
import { rulesForNewFarm } from './session';
import { TutorialProgress } from './tutorial';
import { createSettingsStore } from './settings';
import type { SettingsStore } from './settings';
import { createStore } from './store';
import type { Store } from './store';
import { createUiStore, initialUiState } from './uiState';

/** How often the clock advances while a farm is open and visible. */
const TICK_MS = 500;
/** Coming back to a hidden tab after this long shows the "welcome back" summary. */
const RESUME_SUMMARY_MS = 10 * 60_000;

export type Screen = 'loading' | 'title' | 'farm';

export interface Notice {
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface AppState {
  screen: Screen;
  slots: SlotMeta[];
  slotId: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  welcome: AwaySummary | null;
  notice: Notice | null;
  menuOpen: boolean;
  /** Set when saves can't persist (IndexedDB unavailable). */
  storageWarning: string | null;
  busy: boolean;
  /** Settings dialog tab, or null when closed. 'rules' needs an open farm. */
  settingsOpen: SettingsTab | null;
  /** A new version of the game is downloaded and waiting (PWA). */
  updateReady: boolean;
  /** The browser can install the game as an app. */
  canInstall: boolean;
  /** "How to play" is open. */
  helpOpen: boolean;
}

export type SettingsTab = 'rules' | 'game';

/** Lets the app start, pause and resume the Phaser renderer without depending on it. */
export interface RendererHooks {
  start(session: Session): void;
  pause(): void;
  resume(): void;
  /** Finish queued farm work now (before saving on exit or when the page hides). */
  flush?(): void;
}

export interface GameAppOptions {
  saves: SaveStore;
  emergency: EmergencyStore;
  content: Content;
  renderer?: RendererHooks;
  now?: () => number;
  storageWarning?: string | null;
  /** Device settings; defaults to an in-memory store (tests). */
  settings?: SettingsStore;
  /** Sound; silent by default (tests). */
  audio?: GameAudio;
  /** Where tutorial progress is kept; in memory by default (tests). */
  tutorial?: TutorialProgress;
}

export interface NewFarmOptions {
  farmName: string;
  playerName: string;
  preset: PresetId;
  /** Customised rules from the new-farm form; overrides `preset` when given. */
  rules?: WorldRules;
}

export class GameApp {
  readonly store: Store<AppState>;
  readonly settings: SettingsStore;
  readonly audio: GameAudio;
  readonly tutorial: TutorialProgress;
  /** Bumped when the tutorial is restarted, so the coach re-reads its step. */
  tutorialVersion = 0;
  session: Session | null = null;
  private readonly o: GameAppOptions;
  private readonly now: () => number;
  private transport: LocalTransport | null = null;
  private autosaver: Autosaver | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private hiddenAt: number | null = null;
  private askedForPersistence = false;

  constructor(options: GameAppOptions) {
    this.o = options;
    this.now = options.now ?? (() => Date.now());
    this.settings = options.settings ?? createSettingsStore({ load: () => null, save: () => undefined });
    this.audio = options.audio ?? silentAudio;
    this.tutorial = options.tutorial ?? new TutorialProgress(null);
    const syncVolumes = () => this.audio.setVolumes(this.settings.get().sfxVolume, this.settings.get().musicVolume);
    syncVolumes();
    this.settings.subscribe(syncVolumes);
    this.store = createStore<AppState>({
      screen: 'loading',
      slots: [],
      slotId: null,
      saveStatus: 'idle',
      lastSavedAt: null,
      welcome: null,
      notice: null,
      menuOpen: false,
      storageWarning: options.storageWarning ?? null,
      busy: false,
      settingsOpen: null,
      updateReady: false,
      canInstall: false,
      helpOpen: false,
    });
  }

  setHelpOpen(helpOpen: boolean): void {
    this.store.set({ helpOpen, menuOpen: false });
  }

  private applyUpdate: (() => void) | null = null;

  /** The service worker has a new version ready; `apply` switches to it. */
  setUpdateReady(apply: () => void): void {
    this.applyUpdate = apply;
    this.store.set({ updateReady: true });
  }

  /** Saves, then reloads into the new version. */
  async updateNow(): Promise<void> {
    await this.saveNow();
    this.applyUpdate?.();
  }

  setCanInstall(canInstall: boolean): void {
    this.store.set({ canInstall });
  }

  async init(): Promise<void> {
    await this.refreshSlots();
    this.store.set({ screen: 'title' });
  }

  /** Hooks saving into tab hide / page unload. Returns an unsubscribe function. */
  attachLifecycle(): () => void {
    return watchLifecycle({
      hidden: () => {
        this.audio.setActive(false);
        this.onHidden();
      },
      visible: () => {
        this.audio.setActive(true);
        this.onVisible();
      },
      leaving: () => this.autosaver?.saveEmergencyCopy(),
    });
  }

  // ------------------------------------------------------------------ farm list

  async refreshSlots(): Promise<void> {
    try {
      this.store.set({ slots: await this.o.saves.listSlots() });
    } catch (e) {
      this.notify(`Could not read saved farms: ${errorText(e)}`, 'error');
    }
  }

  async newFarm(options: NewFarmOptions): Promise<void> {
    await this.busy(async () => {
      const now = this.now();
      const farmName = options.farmName.trim() || 'My Farm';
      const playerName = options.playerName.trim() || 'Farmer';
      let rules = rulesForNewFarm(options.preset);
      if (options.rules) {
        const checked = validateRules(options.rules);
        if (!checked.ok) throw new Error(`Those rules aren't valid: ${checked.error}`);
        rules = checked.rules;
      }
      const state = newGame({ farmName, playerName, realNow: now, rules }, this.o.content);
      const slotId = makeSlotId(now);
      const meta = metaFor(slotId, state, now, now, 0);
      await this.o.saves.write(slotId, encodeSave(state, now), meta);
      this.tutorial.set(slotId, 'plow'); // new farms get the tutorial
      this.enterFarm(slotId, state, meta, null);
    });
  }

  async openSlot(slotId: string): Promise<void> {
    await this.busy(async () => {
      const result = await loadSlot(this.o.saves, slotId, this.o.emergency);
      if (!result.ok) {
        console.warn('Load failed', result.problems);
        this.notify(`${result.error} ${result.problems.join(' ')}`.trim(), 'error');
        return;
      }
      const now = this.now();
      const caughtUp = tick(result.state, now, this.o.content);
      const summary = summarizeAway(result.state, caughtUp, now, this.o.content);
      const meta = result.meta ?? metaFor(slotId, caughtUp, result.savedAt, result.savedAt, 0);
      // Restored from a backup: the main copy on disk is damaged, so don't rotate it into the backups.
      this.enterFarm(slotId, caughtUp, meta, isNoteworthy(summary) ? summary : null, result.source !== 'backup');
      if (result.source === 'backup') {
        console.warn('Restored from backup', result.problems);
        this.notify(`Your latest save couldn't be read, so a backup from ${formatAgo(now - result.savedAt)} was restored.`, 'error');
      }
    });
  }

  async exitToTitle(): Promise<void> {
    await this.busy(async () => {
      this.stopClock();
      this.o.renderer?.flush?.();
      if (this.autosaver) {
        try {
          await this.autosaver.saveNow();
        } catch (e) {
          this.notify(`Saving failed: ${errorText(e)}`, 'error');
        }
        this.autosaver.stop();
        this.autosaver = null;
      }
      this.o.renderer?.pause();
      await this.refreshSlots();
      this.store.set({ screen: 'title', slotId: null, menuOpen: false, welcome: null, settingsOpen: null });
    });
  }

  async saveNow(): Promise<void> {
    this.o.renderer?.flush?.();
    try {
      await this.autosaver?.saveNow();
    } catch {
      // status already reported through onStatus
    }
  }

  async deleteSlot(slotId: string): Promise<void> {
    this.tutorial.forget(slotId);
    if (this.store.get().slotId === slotId) return; // can't delete the farm that's open
    await this.busy(async () => {
      await this.o.saves.remove(slotId);
      this.o.emergency.clear(slotId);
      await this.refreshSlots();
    });
  }

  // ------------------------------------------------------------------ export / import

  /** Builds the export file for a slot (saving first if it's the open farm). */
  async exportText(slotId: string): Promise<{ fileName: string; text: string } | null> {
    if (this.store.get().slotId === slotId) await this.saveNow();
    const result = await loadSlot(this.o.saves, slotId, this.o.emergency);
    if (!result.ok) {
      this.notify(result.error, 'error');
      return null;
    }
    const farm = result.state.farms[result.state.homeFarmId]!;
    return {
      fileName: `${safeFileName(farm.name)}.farm`,
      text: JSON.stringify(encodeSave(result.state, this.now()), null, 2),
    };
  }

  async exportSlot(slotId: string): Promise<void> {
    const file = await this.exportText(slotId);
    if (!file) return;
    downloadTextFile(file.fileName, file.text);
    this.notify(`Exported ${file.fileName}`, 'success');
  }

  /** Imports a .farm file as a new farm (never overwrites an existing one). Returns the new slot id. */
  async importText(text: string): Promise<string | null> {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      this.notify('That file is not a farm save.', 'error');
      return null;
    }
    const decoded = decodeSave(raw);
    if (!decoded.ok) {
      this.notify(decoded.error, 'error');
      return null;
    }
    const now = this.now();
    const slotId = makeSlotId(now);
    const state = decoded.state;
    const farm = state.farms[state.homeFarmId]!;
    const takenNames = new Set((await this.o.saves.listSlots()).map((s) => s.farmName));
    if (takenNames.has(farm.name)) farm.name = uniqueName(`${farm.name} (imported)`, takenNames);
    await this.o.saves.write(slotId, encodeSave(state, decoded.savedAt), metaFor(slotId, state, now, decoded.savedAt, 0));
    await this.refreshSlots();
    this.notify(`Imported “${state.farms[state.homeFarmId]!.name}”.`, 'success');
    return slotId;
  }

  // ------------------------------------------------------------------ rules & settings

  /** Applies new World Rules to the open farm (through the transport, like any other change). */
  applyRules(rules: WorldRules): SendResult {
    if (!this.session) return { ok: false, error: { code: 'unknown_farm', message: 'No farm is open.' } };
    const result = this.session.transport.send({ type: 'setRules', rules });
    if (!result.ok) this.notify(result.error.message, 'error');
    return result;
  }

  openSettings(tab: SettingsTab): void {
    this.store.set({ settingsOpen: tab === 'rules' && !this.session ? 'game' : tab, menuOpen: false });
  }

  closeSettings(): void {
    this.store.set({ settingsOpen: null });
  }

  // ------------------------------------------------------------------ small UI actions

  /** Settings > Show the tutorial again (for the open farm). */
  restartTutorial(): void {
    const slotId = this.store.get().slotId;
    if (!slotId) return;
    this.tutorial.set(slotId, 'plow');
    this.tutorialVersion++;
    this.store.set({ settingsOpen: null });
  }

  dismissWelcome(): void {
    this.store.set({ welcome: null });
  }

  dismissNotice(): void {
    this.store.set({ notice: null });
  }

  setMenuOpen(open: boolean): void {
    this.store.set({ menuOpen: open });
  }

  notify(text: string, kind: Notice['kind'] = 'info'): void {
    this.store.set({ notice: { text, kind } });
  }

  // ------------------------------------------------------------------ internals

  private enterFarm(slotId: string, state: GameState, meta: SlotMeta, welcome: AwaySummary | null, backupOnFirstWrite = true): void {
    // Opening a farm while another is open: retire the old farm's autosaver
    // before the new state arrives, or it would save the new farm into the old slot.
    this.autosaver?.stop();
    this.autosaver = null;
    if (!this.transport) {
      this.transport = new LocalTransport(state, this.o.content, this.now);
      this.session = { transport: this.transport, ui: createUiStore(), settings: this.settings, audio: this.audio };
      this.o.renderer?.start(this.session);
    } else {
      this.session!.ui.set(initialUiState());
      this.transport.replaceState(state);
    }

    this.autosaver = new Autosaver({
      transport: this.transport,
      store: this.o.saves,
      emergency: this.o.emergency,
      slotId,
      meta,
      now: this.now,
      backupOnFirstWrite,
      onStatus: (saveStatus, lastSavedAt) => this.store.set({ saveStatus, lastSavedAt }),
    });
    this.autosaver.start();
    // Saves straight away: records the caught-up clock and a backup of the copy that was on disk.
    void this.autosaver.saveNow().catch(() => undefined);

    this.store.set({ screen: 'farm', slotId, welcome, menuOpen: false });
    this.o.renderer?.resume();
    this.startClock();

    if (!this.askedForPersistence) {
      this.askedForPersistence = true;
      void requestPersistentStorage();
    }
  }

  private startClock(): void {
    if (this.clockTimer !== null || !this.transport) return;
    const transport = this.transport;
    this.clockTimer = setInterval(() => transport.tick(this.now()), TICK_MS);
    transport.tick(this.now());
  }

  private stopClock(): void {
    if (this.clockTimer !== null) clearInterval(this.clockTimer);
    this.clockTimer = null;
  }

  private onHidden(): void {
    if (this.store.get().screen !== 'farm') return;
    this.hiddenAt = this.now();
    this.stopClock();
    this.autosaver?.pausePlaytime();
    void this.saveNow();
  }

  private onVisible(): void {
    if (this.store.get().screen !== 'farm' || !this.transport) return;
    const before = this.transport.getState();
    const now = this.now();
    this.transport.tick(now); // offline rules apply to the time spent hidden
    if (this.hiddenAt !== null && now - this.hiddenAt >= RESUME_SUMMARY_MS) {
      const summary = summarizeAway(before, this.transport.getState(), now, this.o.content);
      if (isNoteworthy(summary)) this.store.set({ welcome: summary });
    }
    this.hiddenAt = null;
    this.autosaver?.resumePlaytime();
    this.startClock();
  }

  private async busy(work: () => Promise<void>): Promise<void> {
    if (this.store.get().busy) return;
    this.store.set({ busy: true });
    try {
      await work();
    } catch (e) {
      console.error(e);
      this.notify(errorText(e), 'error');
    } finally {
      this.store.set({ busy: false });
    }
  }
}

function metaFor(slotId: string, state: GameState, createdAt: number, lastSavedAt: number, playtimeMs: number): SlotMeta {
  const player = state.players[state.localPlayerId]!;
  return {
    slotId,
    farmName: state.farms[state.homeFarmId]!.name,
    playerName: player.name,
    level: player.level,
    coins: player.coins,
    createdAt,
    lastSavedAt,
    playtimeMs,
  };
}

/** "Name", or "Name 2", "Name 3"... if taken. */
function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`)) return `${name} ${n}`;
}

function makeSlotId(now: number): string {
  return `farm-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function formatAgo(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} days ago`;
}
