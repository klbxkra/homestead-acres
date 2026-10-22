import Phaser from 'phaser';
import type { Session } from '../../app/session';
import { cancelTool, PAINT_TOOLS, selectTool, startVehicle, toast } from '../../app/uiState';
import type { UiState } from '../../app/uiState';
import {
  contractDef,
  dayIndex,
  entityAt,
  helpedToday,
  helpKindFor,
  helpsLeft,
  inventoryOf,
  isBuilt,
  itemSize,
  lookup,
  neighborHelpCoins,
  placementProblem,
  visitedFarm,
} from '../../core';
import type { Command, Entity, FarmState, GameEvent, GameState, NeighborState } from '../../core';
import { renderPixelRatio, vibrate } from '../../platform/device';
import { describeTile, withArticle } from '../../ui/format';
import { cropArt, decorationArt } from '../art/artData';
import {
  animalKey,
  decorationOrigin,
  ensureDecorationTexture,
  generateTextures,
  setArt,
  TALL_TEX_CENTER_Y,
  TALL_TEX_H,
  TEX_SCALE,
  treeKey,
} from '../art/textures';

const RIBBON_TIERS = ['Yellow', 'White', 'Red', 'Blue'];
const MEDAL_ICONS = { gold: '🥇', silver: '🥈', bronze: '🥉' } as const;
const HELP_WORDS = { fertilized: 'Fertilized', unwithered: 'Revived', picked: 'Picked fruit', fed: 'Fed' } as const;
import { burst } from '../fx/effects';
import { floatText } from '../fx/floatText';
import { soundsFor } from '../fx/sounds';
import { FarmerQueue } from '../queue/farmerQueue';
import type { Job, JobIcon } from '../queue/farmerQueue';
import { FarmerView } from '../views/farmerView';
import { GroundView } from '../views/groundView';
import { bindPointer } from '../input/bindPointer';
import type { DragMode, PressInfo, Pt } from '../input/gestures';
import { KeyboardInput } from '../input/keyboard';
import { cameraWorldRect, farmBounds, pickTile, tileToWorld, TILE_HEIGHT, TILE_WIDTH } from '../iso';
import { resolvePaint, resolveTap, resolveVisitTap } from '../tools/toolActions';
import { createView, destroyView, DEPTH, setViewAlpha, setViewCulled, updateView, viewMismatch } from '../views/entityViews';
import type { EntityView } from '../views/entityViews';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const KEY_PAN_SPEED = 700; // CSS px per second
const CAMERA_MARGIN = TILE_WIDTH * 3;
/** Must match the phone breakpoint and rail width in styles.css. */
const PHONE_MAX_HEIGHT = 500;
const PHONE_RAIL_CSS = 110;

/** Errors worth reporting while painting; the rest (already plowed, not ripe...) are expected and silent. */
const PAINT_REPORTED_ERRORS = new Set(['insufficient_coins', 'locked']);

/** Farm work the farmer walks to (everything else happens at once). */
const JOB_ICONS: Partial<Record<Command['type'], JobIcon>> = { plow: 'plow', plant: 'plant', harvest: 'harvest' };
/** Extra world px around the camera view before a sprite counts as off screen. */
const CULL_MARGIN = 120;
/**
 * Most pop-up numbers on screen at once. Each is a text object with its own
 * small texture, so painting a big field shouldn't create hundreds of them.
 */
const MAX_FLOATS = 24;

interface Tile {
  x: number;
  y: number;
}

/** The farm on screen: your own, or the neighbour you're visiting. */
interface ViewedFarm {
  farm: FarmState;
  neighbor: NeighborState | null;
  helped: ReadonlySet<string>;
}

export class FarmScene extends Phaser.Scene {
  private readonly session: Session;
  private pixelRatio = 1;
  private userZoom = 1;
  private ground!: GroundView;
  private farmer!: FarmerView;
  private queue!: FarmerQueue;
  /** Camera position the views were last culled for. */
  private culledFor = '';
  private hopClock = 0;
  private fullQueueWarned = false;
  private activeFloats = 0;
  private highlight!: Phaser.GameObjects.Graphics;
  private ghostShape!: Phaser.GameObjects.Graphics;
  private ghostImage!: Phaser.GameObjects.Image;
  private readonly views = new Map<string, EntityView>();
  private farmSize = { w: 0, h: 0 };
  private hoverTile: Tile | null = null;
  private ghostTile: Tile | null = null;
  private tooltipTile: Tile | null = null;
  private painted = new Set<string>();
  private lastPaintPoint: Pt | null = null;
  private lastActionTile: Tile | null = null;
  private inputEnabled = true;
  /** Haptics only make sense for finger input. */
  private lastPointerWasTouch = false;
  private keyboard!: KeyboardInput;
  private readonly cleanups: Array<() => void> = [];
  /** Generated neighbour farm, reused until the neighbour, day, level or helps change. */
  private visitCache: { key: string; view: ViewedFarm } | null = null;
  /** Which farm the views were built for ('' = home). */
  private shownFarm = '';

  constructor(session: Session) {
    super('Farm');
    this.session = session;
  }

  private get transport() {
    return this.session.transport;
  }

  private get ui() {
    return this.session.ui;
  }

  /** The farm on screen (home, or the neighbour being visited). */
  private get farm(): FarmState {
    return this.viewed(this.transport.getState()).farm;
  }

  private viewed(state: GameState): ViewedFarm {
    const home: ViewedFarm = { farm: state.farms[state.homeFarmId]!, neighbor: null, helped: new Set() };
    const visiting = this.ui.get().visiting;
    if (!visiting) return home;
    const player = state.players[state.localPlayerId]!;
    const neighbor = player.social.neighbors.slice(0, state.rules.aiNeighborCount).find((n) => n.id === visiting);
    if (!neighbor) return home;
    const now = state.clock.gameNow;
    const key = `${neighbor.id}|${dayIndex(now)}|${player.level}|${neighbor.helpDay}|${neighbor.helped.join(',')}`;
    if (this.visitCache?.key !== key) {
      const farm = visitedFarm(neighbor, player, now, this.transport.content, state.rules);
      this.visitCache = { key, view: { farm, neighbor, helped: helpedToday(neighbor, now) } };
    }
    return this.visitCache.view;
  }

  create(): void {
    this.pixelRatio = renderPixelRatio();
    generateTextures(this, this.transport.content);
    this.ground = new GroundView(this);
    this.queue = this.makeQueue({ x: 0, y: 0 });
    this.farmer = new FarmerView(this);
    this.highlight = this.add.graphics().setDepth(DEPTH.highlight);
    this.ghostShape = this.add.graphics().setDepth(DEPTH.ghost);
    this.ghostImage = this.add.image(0, 0, '__DEFAULT').setScale(1 / TEX_SCALE).setAlpha(0.65).setDepth(DEPTH.ghost + 1).setVisible(false);
    this.cameras.main.setBackgroundColor('#3d6b2a');

    this.syncState(this.transport.getState());
    this.fitCamera();
    this.placeFarmer();
    this.applyBatterySaver();

    this.cleanups.push(
      this.session.settings.subscribe((s, prev) => {
        if (s.batterySaver !== prev.batterySaver) this.applyBatterySaver();
        if (s.instantActions && !prev.instantActions) this.queue.flush();
      }),
      this.transport.subscribeReset(() => this.onReset()),
      this.transport.subscribe((state, events) => {
        this.syncState(state);
        this.playEvents(events);
      }),
      this.ui.subscribe((s, prev) => this.onUiChange(s, prev)),
      bindPointer(this.game.canvas, {
        tap: (p, info) => this.onTap(p, info),
        longPress: (p) => this.showTooltip(this.tileAt(p), p, true),
        hover: (p) => this.onHover(p),
        leave: () => this.onLeave(),
        chooseDragMode: (_start, info) => this.chooseDragMode(info),
        dragStart: (p, mode) => this.onDragStart(p, mode),
        dragMove: (p, delta, mode) => this.onDragMove(p, delta, mode),
        dragEnd: (p, mode) => this.onDragEnd(p, mode),
        pinch: (scale, center, centerDelta) => {
          this.zoomAt(this.userZoom * scale, center);
          this.panBy(centerDelta);
        },
        wheel: (deltaY, p) => this.zoomAt(this.userZoom * (deltaY > 0 ? 0.88 : 1.14), p),
      }),
    );
    this.keyboard = new KeyboardInput({ shortcut: (key) => this.onShortcut(key) });
    this.cleanups.push(() => this.keyboard.destroy());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanups.forEach((c) => c()));
  }

  /** Off while the farm list is showing, so keys typed there don't drive the hidden farm. */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) this.onLeave();
  }

  /** A different farm was loaded (or we went visiting): drop every view and start from a fresh camera. */
  private onReset(): void {
    this.visitCache = null;
    this.culledFor = '';
    for (const view of this.views.values()) destroyView(view);
    this.views.clear();
    this.farmSize = { w: 0, h: 0 };
    this.tooltipTile = null;
    this.hoverTile = null;
    this.ghostTile = null;
    this.painted.clear();
    this.children.list.filter((o) => o.type === 'Text').forEach((o) => o.destroy()); // stray pop-ups
    this.activeFloats = 0;
    this.syncState(this.transport.getState());
    this.fitCamera();
    if (!this.ui.get().visiting) this.placeFarmer();
  }

  /** A new farm (or back from visiting): the farmer starts by the front of the farm with nothing to do. */
  private placeFarmer(): void {
    this.queue.clear();
    this.farmer.reset();
    const s = this.transport.getState();
    const farm = s.farms[s.homeFarmId]!;
    this.queue = this.makeQueue({ x: farm.width * 0.5, y: farm.height - 0.6 });
  }

  private makeQueue(start: { x: number; y: number }): FarmerQueue {
    return new FarmerQueue({ speed: 7, workMs: 260, maxJobs: 80, execute: (job) => this.runJob(job) }, start);
  }

  /** Does all waiting farm work at once (leaving the farm, hiding the page). */
  flushJobs(): void {
    this.queue.flush();
  }

  /** 30 fps and fewer effects (Settings > Battery saver). */
  private applyBatterySaver(): void {
    const loop = this.game.loop as Phaser.Core.TimeStep & { _limitRate: number };
    const saver = this.session.settings.get().batterySaver;
    loop.fpsLimit = saver ? 30 : 0;
    loop.hasFpsLimit = saver;
    loop._limitRate = saver ? 1000 / 30 : 0;
  }

  private get effectsOn(): boolean {
    return !this.session.settings.get().batterySaver;
  }

  override update(time: number, deltaMs: number): void {
    if (!this.inputEnabled) return;
    const v = this.keyboard.panVector();
    if (v.x || v.y) {
      const cam = this.cameras.main;
      const step = (KEY_PAN_SPEED * deltaMs) / 1000 / this.userZoom;
      cam.setScroll(cam.scrollX + v.x * step, cam.scrollY + v.y * step);
    }
    const visiting = this.ui.get().visiting !== null;
    const showFarmer = !visiting && !this.session.settings.get().instantActions;
    this.farmer.setVisible(showFarmer || this.queue.busy);
    this.queue.update(deltaMs);
    this.farmer.update(this.queue, deltaMs, this.effectsOn);
    this.cullViews();
    this.animateViews(time, deltaMs);
  }

  /** Hides sprites outside the camera (re-checked only when the camera moves). */
  private cullViews(): void {
    const cam = this.cameras.main;
    const key = `${Math.round(cam.scrollX)},${Math.round(cam.scrollY)},${cam.zoom.toFixed(3)},${this.views.size}`;
    if (key === this.culledFor) return;
    this.culledFor = key;
    // Not cam.worldView: Phaser only refreshes it when rendering, so right after the
    // camera jumps it still describes the old view.
    const r = cameraWorldRect(cam.scrollX, cam.scrollY, cam.width, cam.height, cam.zoom);
    const view = new Phaser.Geom.Rectangle(r.x - CULL_MARGIN, r.y - CULL_MARGIN, r.width + CULL_MARGIN * 2, r.height + CULL_MARGIN * 2);
    for (const v of this.views.values()) setViewCulled(v, !view.contains(v.wx, v.wy));
    this.ground.cull(view);
  }

  /** Ready bubbles bob; now and then an animal hops. */
  private animateViews(time: number, deltaMs: number): void {
    const on = this.effectsOn;
    for (const v of this.views.values()) {
      if (v.kind !== 'item' || !v.showMarker || v.culled) continue;
      v.marker.y = v.markerY + (on ? Math.sin(time / 320 + v.wx * 0.05) * 2 : 0);
    }
    if (!on) return;
    this.hopClock += deltaMs;
    if (this.hopClock < 1800) return;
    this.hopClock = 0;
    const animals = [...this.views.values()].filter((v) => v.kind === 'item' && v.entityKind === 'animal' && !v.culled);
    const pick = animals[Math.floor(Math.random() * animals.length)];
    if (pick?.kind === 'item' && !this.tweens.isTweening(pick.image)) {
      this.tweens.add({ targets: pick.image, y: pick.image.y - 5, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    }
  }

  /**
   * Called by the game shell after every canvas resize (window resize, rotation,
   * pixel-ratio change). `keepCenter` is the world point that was in the middle of
   * the screen before, so the view doesn't drift when the canvas changes size.
   */
  setPixelRatio(ratio: number, keepCenter?: Pt): void {
    this.pixelRatio = ratio;
    const cam = this.cameras.main;
    cam.setZoom(this.userZoom * ratio);
    this.updateCameraBounds();
    if (keepCenter) cam.centerOn(keepCenter.x, keepCenter.y);
  }

  /** World point currently at the centre of the screen. */
  screenCenterWorld(): Pt {
    const cam = this.cameras.main;
    return { x: cam.scrollX + cam.width / 2, y: cam.scrollY + cam.height / 2 };
  }

  // ---------------------------------------------------------------- state -> views

  private syncState(state: GameState): void {
    const { farm, helped } = this.viewed(state);
    if (farm.id !== this.shownFarm) {
      this.shownFarm = farm.id;
      if (this.views.size) return this.onReset();
    }
    if (farm.width !== this.farmSize.w || farm.height !== this.farmSize.h) this.rebuildGround(farm);

    const { gameNow } = state.clock;
    const seen = new Set<string>();
    for (const entity of Object.values(farm.entities)) {
      seen.add(entity.id);
      let view = this.views.get(entity.id);
      if (!view || viewMismatch(view, entity)) {
        if (view) destroyView(view);
        view = createView(this, entity);
        this.views.set(entity.id, view);
      }
      updateView(this, view, entity, gameNow, state.rules, this.transport.content, { helped: helped.has(entity.id) });
      setViewAlpha(view, entity.id === this.ui.get().movingEntityId ? 0.35 : 1);
    }
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        destroyView(view);
        this.views.delete(id);
      }
    }

    if (this.tooltipTile) this.refreshTooltip();
    this.drawGhost();
  }

  private rebuildGround(farm: FarmState): void {
    this.farmSize = { w: farm.width, h: farm.height };
    this.ground.rebuild(farm.width, farm.height);
    this.culledFor = '';
    this.updateCameraBounds();
  }

  /**
   * Pan limits: the farm plus a margin, but never smaller than the visible area.
   * (When the view is bigger than the bounds, Phaser pins it to the top-left
   * instead of centring it, which left the farm at the top of tall screens.)
   */
  private updateCameraBounds(): void {
    if (!this.farmSize.w) return;
    const cam = this.cameras.main;
    const b = farmBounds(this.farmSize.w, this.farmSize.h);
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    const halfW = Math.max((b.right - b.left) / 2 + CAMERA_MARGIN, cam.width / cam.zoom / 2);
    const halfH = Math.max((b.bottom - b.top) / 2 + CAMERA_MARGIN, cam.height / cam.zoom / 2);
    cam.setBounds(cx - halfW, cy - halfH, halfW * 2, halfH * 2);
  }

  /** Initial zoom that shows the whole farm, centred in the space the HUD leaves free. */
  private fitCamera(): void {
    const b = farmBounds(this.farmSize.w, this.farmSize.h);
    const cssW = this.scale.width / this.pixelRatio;
    const cssH = this.scale.height / this.pixelRatio;
    // Phones (the max-height: 500px layout in styles.css) have the toolbar as a rail on the right.
    const railCss = cssH <= PHONE_MAX_HEIGHT ? PHONE_RAIL_CSS : 0;
    const fit = Math.min((cssW - railCss) / (b.right - b.left + 40), cssH / (b.bottom - b.top + 120));
    this.userZoom = Phaser.Math.Clamp(fit, MIN_ZOOM, 1.4);
    this.cameras.main.setZoom(this.userZoom * this.pixelRatio);
    this.updateCameraBounds();
    this.cameras.main.centerOn(railCss / 2 / this.userZoom, (b.top + b.bottom) / 2 - 10 / this.userZoom);
  }

  // ---------------------------------------------------------------- coordinates & camera

  /** CSS px (relative to the canvas) -> world coordinates, independent of Phaser's per-frame camera matrix. */
  private toWorld(p: Pt): Pt {
    const cam = this.cameras.main;
    const sx = p.x * this.pixelRatio;
    const sy = p.y * this.pixelRatio;
    return {
      x: cam.scrollX + cam.width / 2 + (sx - cam.width / 2) / cam.zoom,
      y: cam.scrollY + cam.height / 2 + (sy - cam.height / 2) / cam.zoom,
    };
  }

  private tileAt(p: Pt): Tile {
    const w = this.toWorld(p);
    return pickTile(w.x, w.y);
  }

  private zoomAt(zoom: number, p: Pt): void {
    const cam = this.cameras.main;
    const before = this.toWorld(p);
    this.userZoom = Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    cam.setZoom(this.userZoom * this.pixelRatio);
    this.updateCameraBounds();
    const sx = p.x * this.pixelRatio;
    const sy = p.y * this.pixelRatio;
    cam.setScroll(before.x - cam.width / 2 - (sx - cam.width / 2) / cam.zoom, before.y - cam.height / 2 - (sy - cam.height / 2) / cam.zoom);
  }

  private panBy(deltaCss: Pt): void {
    const cam = this.cameras.main;
    cam.setScroll(cam.scrollX - (deltaCss.x * this.pixelRatio) / cam.zoom, cam.scrollY - (deltaCss.y * this.pixelRatio) / cam.zoom);
  }

  private screenCenter(): Pt {
    return { x: this.scale.width / this.pixelRatio / 2, y: this.scale.height / this.pixelRatio / 2 };
  }

  // ---------------------------------------------------------------- input

  private onTap(p: Pt, info: PressInfo): void {
    this.lastPointerWasTouch = info.pointerType === 'touch';
    if (info.button === 2) return cancelTool(this.ui);
    if (this.ui.get().tooltip && info.pointerType !== 'mouse') {
      this.hideTooltip(); // first tap after a long-press just dismisses the info bubble
      return;
    }
    this.act(this.tileAt(p), p);
  }

  private onHover(p: Pt): void {
    const tile = this.tileAt(p);
    if (this.hoverTile && this.hoverTile.x === tile.x && this.hoverTile.y === tile.y) return;
    this.hoverTile = tile;
    this.ghostTile = tile;
    this.drawHighlight();
    this.drawGhost();
    // Mouse users get info on hover for anything that's not bare grass.
    const onEntity = entityAt(this.farm, tile.x, tile.y, this.transport.content);
    const hoverInfo = this.session.settings.get().hoverTooltips || this.ui.get().visiting !== null;
    if (onEntity && !this.holdingSomething() && hoverInfo) this.showTooltip(tile, p, false);
    else this.hideTooltip();
  }

  private onLeave(): void {
    this.hoverTile = null;
    this.ghostTile = null;
    this.drawHighlight();
    this.drawGhost();
    this.hideTooltip();
  }

  private chooseDragMode(info: PressInfo): DragMode {
    this.lastPointerWasTouch = info.pointerType === 'touch';
    if (info.button === 1 || info.button === 2) return 'pan';
    const ui = this.ui.get();
    if (ui.visiting) return 'pan';
    if (info.pointerType !== 'mouse' && this.holdingSomething()) return 'ghost';
    if ((ui.paint || info.shiftKey) && PAINT_TOOLS.includes(ui.tool)) return 'paint';
    return 'pan';
  }

  private onDragStart(p: Pt, mode: DragMode): void {
    this.hideTooltip();
    if (mode === 'paint') {
      this.painted.clear();
      this.lastPaintPoint = null;
      this.paintAt(p);
    } else if (mode === 'ghost') {
      this.ghostTile = this.tileAt(p);
      this.drawGhost();
    }
  }

  private onDragMove(p: Pt, delta: Pt, mode: DragMode): void {
    if (mode === 'pan') this.panBy(delta);
    else if (mode === 'paint') this.paintAt(p);
    else {
      this.ghostTile = this.tileAt(p);
      this.drawGhost();
    }
  }

  private onDragEnd(p: Pt, mode: DragMode): void {
    if (mode === 'ghost') this.act(this.tileAt(p), p); // drop the held item where the finger lifted
    this.painted.clear();
    this.lastPaintPoint = null;
  }

  private onShortcut(key: string): void {
    if (!this.inputEnabled) return;
    const ui = this.ui;
    if (ui.get().visiting && !['escape', 'n', '+', '=', '-', '_'].includes(key)) return; // no farm tools on someone else's farm
    const tools: Record<string, UiState['tool']> = { '1': 'multi', '2': 'plow', '3': 'seed', '4': 'harvest', '5': 'move', '6': 'sell', '7': 'store' };
    const tool = tools[key];
    if (tool) {
      if (tool === 'seed' && !ui.get().seedId) ui.set({ marketOpen: true, marketTab: 'seeds' });
      else selectTool(ui, tool);
      return;
    }
    switch (key) {
      case 'escape':
        return cancelTool(ui);
      case '8': {
        const owned = this.transport.getState().players[this.transport.playerId]!.vehicles;
        if (owned.length === 0) return ui.set({ marketOpen: true, marketTab: 'vehicles' });
        const s = ui.get();
        const i = s.tool === 'vehicle' && s.vehicleId ? owned.indexOf(s.vehicleId) : -1;
        return startVehicle(ui, owned[(i + 1) % owned.length]!);
      }
      case 'i':
        return ui.set((s) => ({ panel: s.panel === 'inventory' ? null : 'inventory' }));
      case 'b':
        return ui.set((s) => ({ panel: s.panel === 'book' ? null : 'book' }));
      case 'n':
        return ui.set((s) => ({ panel: s.panel === 'neighbors' ? null : 'neighbors' }));
      case 'm':
        return ui.set((s) => ({ marketOpen: !s.marketOpen }));
      case 'p':
        return ui.set((s) => ({ paint: !s.paint }));
      case 'r':
        if (this.holdingSomething()) ui.set((s) => ({ rotated: !s.rotated }));
        return;
      case '+':
      case '=':
        return this.zoomAt(this.userZoom * 1.2, this.screenCenter());
      case '-':
      case '_':
        return this.zoomAt(this.userZoom / 1.2, this.screenCenter());
    }
  }

  private onUiChange(s: UiState, prev: UiState): void {
    if (s.visiting !== prev.visiting) {
      if (s.visiting) this.queue.flush(); // the farmer finishes up before you head out
      this.syncState(this.transport.getState());
      return;
    }
    if (s.movingEntityId !== prev.movingEntityId) {
      for (const [id, view] of this.views) setViewAlpha(view, id === s.movingEntityId ? 0.35 : 1);
    }
    if (
      s.tool !== prev.tool ||
      s.movingEntityId !== prev.movingEntityId ||
      s.placeItemId !== prev.placeItemId ||
      s.vehicleId !== prev.vehicleId ||
      s.supplyId !== prev.supplyId ||
      s.rotated !== prev.rotated
    ) {
      this.drawGhost();
      this.drawHighlight();
    }
  }

  // ---------------------------------------------------------------- actions

  private act(tile: Tile, p: Pt): void {
    const state = this.transport.getState();
    const ui = this.ui.get();
    const viewed = this.viewed(state);
    const farm = viewed.farm;
    const outcome = viewed.neighbor
      ? resolveVisitTap(viewed.neighbor.id, farm, tile, viewed.helped, state.clock.gameNow, state.rules, this.transport.content)
      : resolveTap(ui, farm, tile, state.clock.gameNow, state.rules, this.transport.content);

    switch (outcome.kind) {
      case 'command': {
        const { confirm } = outcome;
        const command = this.predicted(outcome.command);
        if (!command) return;
        if (confirm && this.session.settings.get().confirmSell) {
          this.ui.set({ confirm: { message: confirm, confirmLabel: 'Sell', onConfirm: () => this.send(command, tile) } });
        } else {
          this.send(command, tile);
        }
        return;
      }
      case 'openMarket':
        this.ui.set({ marketOpen: true, marketTab: outcome.tab });
        return;
      case 'pick': {
        const entity = lookup(farm.entities, outcome.entityId);
        this.ui.set({ movingEntityId: outcome.entityId, rotated: entity?.kind === 'decoration' ? entity.rotated : false });
        this.hideTooltip();
        return;
      }
      case 'construction':
        this.ui.set({ constructionId: outcome.entityId, tooltip: null });
        return;
      case 'inspect':
        this.showTooltip(tile, p, true);
        return;
      case 'none':
        return;
    }
  }

  /**
   * With jobs waiting, the farm on screen is behind what's been asked for. A
   * multi-tool tap on a plot that's about to be plowed plants it instead; a
   * repeat of a waiting job is dropped.
   */
  private predicted(command: Command): Command | null {
    if (command.type !== 'plow' || !this.queue.has(command.x, command.y, 'plow')) return command;
    const ui = this.ui.get();
    if (ui.tool === 'multi' && ui.seedId && !this.queue.has(command.x, command.y, 'plant')) {
      return { type: 'plant', x: command.x, y: command.y, cropId: ui.seedId };
    }
    return null;
  }

  /** Farm work goes to the farmer's queue (unless actions are instant); everything else happens now. */
  private send(command: Command, tile: Tile, quiet = false): boolean {
    const icon = JOB_ICONS[command.type];
    if (icon && !this.ui.get().visiting && !this.session.settings.get().instantActions) {
      const added = this.queue.add({ x: tile.x, y: tile.y, command, icon, quiet });
      if (added === 'full' && !this.fullQueueWarned) {
        this.fullQueueWarned = true;
        toast(this.ui, 'Your farmer has plenty to do. Let him catch up!', 'info');
      }
      if (added === 'queued') {
        this.fullQueueWarned = false;
        if (this.lastPointerWasTouch && this.session.settings.get().haptics) vibrate(6);
        if (!quiet) this.session.audio.play('tap');
      }
      return added === 'queued';
    }
    return this.sendNow(command, tile, quiet);
  }

  /** The farmer reached a job and did it. */
  private runJob(job: Job): void {
    this.sendNow(job.command, { x: job.x, y: job.y }, job.quiet);
  }

  private sendNow(command: Command, tile: Tile, quiet = false): boolean {
    this.lastActionTile = tile;
    const result = this.transport.send(command);
    if (!result.ok) {
      if (!quiet || PAINT_REPORTED_ERRORS.has(result.error.code)) toast(this.ui, result.error.message, 'error');
      return false;
    }
    if (command.type === 'move') this.ui.set({ movingEntityId: null, rotated: false });
    if (command.type === 'place') {
      // Placed the last one from the gift box / storage: nothing left to hold.
      const player = this.transport.getState().players[this.transport.playerId]!;
      const left = lookup(inventoryOf(player, command.from), command.itemId) ?? 0;
      if (left === 0) selectTool(this.ui, 'multi');
    }
    if (command.type === 'useSupply') {
      const player = this.transport.getState().players[this.transport.playerId]!;
      if (!lookup(player.giftBox, command.itemId)) selectTool(this.ui, 'multi'); // used the last one
    }
    if (this.lastPointerWasTouch && this.session.settings.get().haptics) vibrate(command.type === 'harvest' ? 15 : 8);
    return true;
  }

  /**
   * Paints every tile on the segment from the previous paint point to `p`, so
   * fast swipes (few pointer events) don't skip plots.
   */
  private paintAt(p: Pt): void {
    const from = this.lastPaintPoint ?? p;
    this.lastPaintPoint = p;
    const a = this.toWorld(from);
    const b = this.toWorld(p);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (TILE_HEIGHT / 4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const tile = pickTile(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      this.paintTile(tile);
    }
  }

  private paintTile(tile: Tile): void {
    const key = `${tile.x},${tile.y}`;
    if (this.painted.has(key)) return;
    this.painted.add(key);
    const state = this.transport.getState();
    if (this.ui.get().visiting) return;
    const resolved = resolvePaint(this.ui.get(), state.farms[state.homeFarmId]!, tile, state.clock.gameNow, state.rules, this.transport.content);
    const command = resolved && this.predicted(resolved);
    if (command) this.send(command, tile, true);
  }

  private buildingItemId(entityId: string): string | undefined {
    const s = this.transport.getState();
    const e = lookup(s.farms[s.homeFarmId]!.entities, entityId);
    return e && e.kind !== 'plot' ? e.itemId : undefined;
  }

  private neighborName(id: string): string {
    const s = this.transport.getState();
    return s.players[s.localPlayerId]!.social.neighbors.find((n) => n.id === id)?.name ?? 'Your neighbor';
  }

  private itemName(itemId: string): string {
    const c = this.transport.content;
    return lookup(c.placeables, itemId)?.name ?? lookup(c.supplies, itemId)?.name ?? 'A gift';
  }

  private playEvents(events: readonly GameEvent[]): void {
    const content = this.transport.content;
    for (const sound of soundsFor(events)) this.session.audio.play(sound);
    let stack = 0;
    const at = (tile: Tile | null) => {
      const t = tile ?? this.lastActionTile ?? { x: 0, y: 0 };
      const w = tileToWorld(t.x, t.y);
      return { x: w.x, y: w.y - 10 - stack++ * 16 };
    };
    for (const e of events) {
      if (this.effectsOn) this.effect(e);
      switch (e.type) {
        case 'plowed':
        case 'planted':
          if (e.cost > 0) this.float(at(e), `-${e.cost}`, 'cost');
          break;
        case 'harvested':
        case 'collected':
          if (e.coins > 0) this.float(at(e), `+${e.coins}`, 'coins');
          break;
        case 'placed': {
          if (e.cost > 0) this.float(at(e), `-${e.cost}`, 'cost');
          const s = this.transport.getState();
          const placed = lookup(s.farms[s.homeFarmId]!.entities, e.entityId);
          if (placed?.kind === 'building' && placed.parts) toast(this.ui, `🏗️ ${this.itemName(e.itemId)} frame placed. Tap it to add building parts.`, 'info');
          break;
        }
        case 'sold':
          if (e.refund > 0) this.float(at(this.lastActionTile), `+${e.refund}`, 'coins');
          break;
        case 'itemSold':
          if (e.refund > 0) toast(this.ui, `Sold for ${e.refund.toLocaleString('en-US')} coins.`, 'success');
          break;
        case 'xpGained':
          this.float(at(this.lastActionTile), `+${formatXp(e.amount)} XP`, 'xp', 120);
          break;
        case 'levelUp':
          // The big banner is the UI's Celebration; here just a buzz.
          if (this.lastPointerWasTouch && this.session.settings.get().haptics) vibrate(40);
          break;
        case 'animalHoused': {
          const name = this.itemName(e.itemId);
          const home = lookup(content.buildings, this.buildingItemId(e.buildingId) ?? '')?.name ?? 'building';
          toast(this.ui, `${name} moved into the ${home}.`, 'success');
          break;
        }
        case 'stored':
          toast(this.ui, `${lookup(content.placeables, e.itemId)?.name ?? 'Item'} put in storage.`, 'info');
          break;
        case 'masteryStar': {
          const crop = lookup(content.crops, e.cropId)?.name ?? e.cropId;
          toast(this.ui, `${'★'.repeat(e.star)} ${crop} mastery! +${e.coins.toLocaleString('en-US')} coins`, 'success');
          break;
        }
        case 'ribbonEarned': {
          const ribbon = content.ribbons.find((r) => r.id === e.ribbonId);
          toast(this.ui, `🎀 ${RIBBON_TIERS[e.tier - 1] ?? ''} ribbon: ${ribbon?.name ?? e.ribbonId}!`, 'success');
          break;
        }
        case 'collectibleFound': {
          const set = content.collections.find((c) => c.id === e.collectionId);
          const item = set?.items.find((i) => i.id === e.collectibleId);
          this.float(at(e), `✨ ${item?.name ?? 'Collectible'}`, 'xp', 200);
          toast(this.ui, `Found ${withArticle(item?.name ?? 'collectible')} for ${set?.name ?? 'a collection'}!`, 'info');
          break;
        }
        case 'collectionCompleted':
          toast(this.ui, `Collection complete: ${content.collections.find((c) => c.id === e.collectionId)?.name}!`, 'success');
          break;
        case 'itemReceived':
          if (e.reason === 'baby') toast(this.ui, `🍼 A baby ${this.itemName(e.itemId).toLowerCase()} was born! It's in your gift box.`, 'success');
          else toast(this.ui, `🎁 ${this.itemName(e.itemId)} added to your gift box.`, 'success');
          break;
        case 'neighborHelped':
          this.float(at(e), `+${e.coins}`, 'coins');
          this.float(at(e), HELP_WORDS[e.help], 'xp', 80);
          break;
        case 'neighborThanks':
          toast(this.ui, `💌 ${this.neighborName(e.neighborId)} says thanks!${e.itemId ? ` ${capitalize(withArticle(this.itemName(e.itemId)))} is in your mailbox.` : ''}`, 'success');
          break;
        case 'giftsAccepted': {
          const total = e.items.reduce((n, i) => n + i.count, 0);
          toast(this.ui, `🎁 ${total} ${total === 1 ? 'gift' : 'gifts'} moved to your gift box.`, 'success');
          break;
        }
        case 'supplyBought':
          // Parts bought from the construction dialog go straight into the building.
          if (!this.ui.get().constructionId) toast(this.ui, `${e.count} × ${this.itemName(e.itemId)} added to your gift box.`, 'success');
          break;
        case 'supplyUsed': {
          const kind = lookup(content.supplies, e.itemId)?.kind;
          const text =
            kind === 'fuel'
              ? `+${e.affected} fuel.`
              : kind === 'fertilizer'
                ? `Fertilized ${e.affected} ${e.affected === 1 ? 'crop' : 'crops'}.`
                : kind === 'instagrow'
                  ? `${e.affected} ${e.affected === 1 ? 'crop is' : 'crops are'} ripe!`
                  : `Revived ${e.affected} withered ${e.affected === 1 ? 'crop' : 'crops'}.`;
          toast(this.ui, text, 'success');
          break;
        }
        case 'partsAdded':
          if (e.missing > 0) toast(this.ui, `Added ${e.added} ${e.added === 1 ? 'part' : 'parts'}. ${e.missing} still to go.`, 'info');
          break;
        case 'constructionCompleted':
          toast(this.ui, `🏗️ ${this.itemName(e.itemId)} is finished!`, 'success');
          break;
        case 'contractStarted':
          toast(this.ui, `📋 Co-op job started: ${contractDef(content, e.contractId)?.name ?? 'job'}.`, 'success');
          break;
        case 'contractCompleted':
          toast(this.ui, `${MEDAL_ICONS[e.medal]} ${contractDef(content, e.contractId)?.name ?? 'Co-op job'} done! Claim your reward in 👥 Neighbors.`, 'success');
          break;
        case 'contractClaimed':
          toast(this.ui, `${MEDAL_ICONS[e.medal]} ${e.medal[0]!.toUpperCase()}${e.medal.slice(1)} medal! +${e.coins.toLocaleString('en-US')} coins`, 'success');
          break;
        case 'contractFailed':
          toast(this.ui, `The ${contractDef(content, e.contractId)?.name ?? 'co-op job'} ran out of time.`, 'info');
          break;
        case 'contractAbandoned':
          break;
        case 'vehicleBought':
          toast(this.ui, `${lookup(content.vehicles, e.vehicleId)?.name} bought! Tap plots to drive it.`, 'success');
          break;
        case 'farmExpanded':
          toast(this.ui, `Your farm is now ${e.size}×${e.size}!`, 'success');
          break;
        case 'refueled':
          toast(this.ui, `Tank filled for ${e.cash} Farm Cash.`, 'success');
          break;
        case 'vehicleUsed':
        case 'dailyBonus':
          break;
        case 'rulesChanged':
          toast(
            this.ui,
            e.refreshed > 0
              ? `Rules updated. ${e.refreshed} ripe ${e.refreshed === 1 ? 'crop got' : 'crops got'} a fresh harvest window.`
              : 'Rules updated.',
            'success',
          );
          break;
        case 'moved':
          break;
      }
    }
  }

  /** Particles for farm work and celebrations. */
  private effect(e: GameEvent): void {
    const tileFx = (x: number, y: number, colors: number[], count = 8, rise = 14) => {
      const w = tileToWorld(x, y);
      burst(this, w.x, w.y - 4, { count, colors, spread: 18, rise, durationMs: 600 });
    };
    switch (e.type) {
      case 'plowed':
        return tileFx(e.x, e.y, [0x8d6e63, 0x6d4c41, 0xa1887f], 7, 8);
      case 'planted':
        return tileFx(e.x, e.y, [0x81c784, 0x66bb6a], 5, 10);
      case 'harvested':
        return tileFx(e.x, e.y, [cropArt(e.cropId).fruit, 0x81c784, 0xfff59d], 10, 22);
      case 'collected':
        return tileFx(e.x, e.y, [0xffd54f, 0xffecb3], 10, 26);
      case 'neighborHelped':
        return tileFx(e.x, e.y, [0x81c784, 0xfff59d, 0xffffff], 8, 20);
      case 'supplyUsed':
        if (e.x !== null && e.y !== null) {
          const area = lookup(this.transport.content.supplies, e.itemId)?.area ?? 1;
          return tileFx(e.x + (area - 1) / 2, e.y + (area - 1) / 2, [0xfff59d, 0xb2ff59, 0xffffff], 18, 24);
        }
        return;
      case 'constructionCompleted': {
        const s = this.transport.getState();
        const b = lookup(s.farms[s.homeFarmId]!.entities, e.entityId);
        if (b) return tileFx(b.x + 0.5, b.y + 0.5, [0xbdbdbd, 0xffd54f, 0xffffff], 24, 30);
        return;
      }
      default:
        return;
    }
  }

  private float(p: Pt, text: string, kind: 'coins' | 'cost' | 'xp', delay = 0): void {
    if (!this.session.settings.get().floatingNumbers || this.activeFloats >= MAX_FLOATS) return;
    this.activeFloats++;
    floatText(this, p.x, p.y, text, kind, delay, () => this.activeFloats--);
  }

  // ---------------------------------------------------------------- overlays

  private holdingSomething(): boolean {
    const ui = this.ui.get();
    return (ui.tool === 'place' && ui.placeItemId !== null) || (ui.tool === 'move' && ui.movingEntityId !== null);
  }

  private drawHighlight(): void {
    const g = this.highlight.clear();
    const t = this.hoverTile;
    if (!t || this.holdingSomething()) return;
    if (t.x < 0 || t.y < 0 || t.x >= this.farmSize.w || t.y >= this.farmSize.h) return;
    const { x, y } = tileToWorld(t.x, t.y);
    g.lineStyle(2, 0xfff3b0, 1);
    diamondPath(g, x, y, 1, 1);
    g.strokePath();
  }

  /**
   * Footprint preview: for placing or moving (green when it fits, red when it
   * doesn't; animals over a matching building count as fitting), and the work
   * area of the selected vehicle.
   */
  private drawGhost(): void {
    const g = this.ghostShape.clear();
    this.ghostImage.setVisible(false);
    const t = this.ghostTile;
    const ui = this.ui.get();
    if (!t) return;

    const content = this.transport.content;
    if (ui.visiting) return;
    const areaTool = (ui.tool === 'vehicle' && ui.vehicleId) || (ui.tool === 'supply' && ui.supplyId);
    if (areaTool) {
      const area = (ui.tool === 'vehicle' ? lookup(content.vehicles, ui.vehicleId ?? '')?.area : lookup(content.supplies, ui.supplyId ?? '')?.area) ?? 1;
      const center = tileToWorld(t.x + (area - 1) / 2, t.y + (area - 1) / 2);
      g.fillStyle(0xffe082, 0.35);
      g.lineStyle(2, 0xffca28, 1);
      diamondPath(g, center.x, center.y, area, area);
      g.fillPath();
      g.strokePath();
      return;
    }
    if (!this.holdingSomething()) return;

    const farm = this.farm;
    let itemId: string | null = null;
    let rotated = ui.rotated;
    let size = { w: 1, h: 1 };
    let ignoreId: string | undefined;

    if (ui.tool === 'place' && ui.placeItemId) {
      itemId = ui.placeItemId;
      size = itemSize(itemId, rotated, content) ?? size;
    } else if (ui.movingEntityId) {
      const entity: Entity | undefined = lookup(farm.entities, ui.movingEntityId);
      if (!entity) return;
      ignoreId = entity.id;
      if (entity.kind === 'plot') {
        size = { w: 1, h: 1 };
      } else {
        itemId = entity.itemId;
        if (entity.kind === 'tree' || entity.kind === 'animal') rotated = false;
        size = itemSize(itemId, rotated, content) ?? size;
      }
    }

    const fits =
      placementProblem(farm, { x: t.x, y: t.y, ...size }, content, ignoreId) === null ||
      (itemId !== null && this.canHouseAt(itemId, t));
    const center = tileToWorld(t.x + (size.w - 1) / 2, t.y + (size.h - 1) / 2);
    g.fillStyle(fits ? 0x66bb6a : 0xef5350, 0.45);
    g.lineStyle(2, fits ? 0xc8e6c9 : 0xffcdd2, 1);
    diamondPath(g, center.x, center.y, size.w, size.h);
    g.fillPath();
    g.strokePath();

    if (!itemId) return;
    const item = lookup(content.placeables, itemId);
    if (!item) return;
    if (item.kind === 'tree' || item.kind === 'animal') {
      const key = item.kind === 'tree' ? treeKey(itemId, false) : animalKey(itemId);
      setArt(this.ghostImage, key).setOrigin(0.5, TALL_TEX_CENTER_Y / TALL_TEX_H).setPosition(center.x, center.y).setVisible(true);
    } else {
      const key = ensureDecorationTexture(this, itemId, item.width, item.height, rotated);
      const origin = decorationOrigin(size.w, size.h, decorationArt(itemId).height, itemId);
      setArt(this.ghostImage, key).setOrigin(origin.x, origin.y).setPosition(center.x, center.y).setVisible(true);
    }
  }

  /** Would dropping this animal or tree here move it into a building with room? */
  private canHouseAt(itemId: string, t: Tile): boolean {
    const content = this.transport.content;
    if (!lookup(content.animals, itemId) && !lookup(content.trees, itemId)) return false;
    const target = entityAt(this.farm, t.x, t.y, content);
    if (target?.kind !== 'building' || !isBuilt(target)) return false;
    const def = lookup(content.buildings, target.itemId);
    return !!def && def.houses.includes(itemId) && target.housed.length < def.capacity;
  }

  /** Tooltip text; while visiting, says whether you can help there. */
  private describe(tile: Tile) {
    const state = this.transport.getState();
    const viewed = this.viewed(state);
    const desc = describeTile(viewed.farm, tile.x, tile.y, state.clock.gameNow, state.rules, this.transport.content);
    if (!desc || !viewed.neighbor) return desc;
    const entity = entityAt(viewed.farm, tile.x, tile.y, this.transport.content);
    if (!entity) return null;
    // A neighbour's things aren't for sale and their timers aren't yours to plan around.
    const lines = desc.lines.filter((l) => !l.startsWith('Sells') && l !== 'Reward item');
    if (viewed.helped.has(entity.id)) lines.push('✅ You helped here today');
    else if (helpKindFor(entity, state.clock.gameNow, state.rules)) {
      lines.push(
        helpsLeft(viewed.neighbor, state.clock.gameNow, state.rules) > 0
          ? `Tap to help: +${neighborHelpCoins(this.transport.content, state.rules)} coins`
          : `You've helped ${viewed.neighbor.name} enough today`,
      );
    }
    return { title: desc.title, lines };
  }

  private showTooltip(tile: Tile, p: Pt, includeGrass: boolean): void {
    const desc = this.describe(tile);
    if (!desc || (!includeGrass && desc.title === 'Grass')) return this.hideTooltip();
    this.tooltipTile = tile;
    this.ui.set({ tooltip: { x: p.x, y: p.y, ...desc } });
  }

  private refreshTooltip(): void {
    const tip = this.ui.get().tooltip;
    if (!tip || !this.tooltipTile) return;
    const desc = this.describe(this.tooltipTile);
    if (!desc) return this.hideTooltip();
    if (desc.title !== tip.title || desc.lines.join('|') !== tip.lines.join('|')) this.ui.set({ tooltip: { ...tip, ...desc } });
  }

  private hideTooltip(): void {
    this.tooltipTile = null;
    if (this.ui.get().tooltip) this.ui.set({ tooltip: null });
  }
}

/** Outline of a w x h tile footprint centred on (cx, cy). */
function diamondPath(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number): void {
  const hw = TILE_WIDTH / 2;
  const hh = TILE_HEIGHT / 2;
  // Corners of the footprint relative to its centre, in tile units.
  const corner = (a: number, b: number) => ({ x: cx + (a - b) * hw, y: cy + (a + b) * hh });
  const top = corner(-w / 2, -h / 2);
  const right = corner(w / 2, -h / 2);
  const bottom = corner(w / 2, h / 2);
  const left = corner(-w / 2, h / 2);
  g.beginPath();
  g.moveTo(top.x, top.y);
  g.lineTo(right.x, right.y);
  g.lineTo(bottom.x, bottom.y);
  g.lineTo(left.x, left.y);
  g.closePath();
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatXp(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}
