import Phaser from 'phaser';
import type { Session } from '../../app/session';
import { cancelTool, PAINT_TOOLS, selectTool, toast } from '../../app/uiState';
import type { UiState } from '../../app/uiState';
import { entityAt, footprintOf, itemSize, lookup, placementProblem } from '../../core';
import type { Command, Entity, FarmState, GameEvent, GameState } from '../../core';
import { renderPixelRatio } from '../../platform/device';
import { describeTile } from '../../ui/format';
import { decorationArt } from '../art/artData';
import { decorationOrigin, ensureDecorationTexture, generateTextures, TEX_SCALE } from '../art/textures';
import { floatText } from '../fx/floatText';
import { bindPointer } from '../input/bindPointer';
import type { DragMode, PressInfo, Pt } from '../input/gestures';
import { KeyboardInput } from '../input/keyboard';
import { farmBounds, pickTile, tileToWorld, TILE_HEIGHT, TILE_WIDTH } from '../iso';
import { resolvePaint, resolveTap } from '../tools/toolActions';
import { createView, destroyView, DEPTH, setViewAlpha, updateView } from '../views/entityViews';
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

interface Tile {
  x: number;
  y: number;
}

export class FarmScene extends Phaser.Scene {
  private readonly session: Session;
  private pixelRatio = 1;
  private userZoom = 1;
  private ground!: Phaser.GameObjects.Graphics;
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
  private keyboard!: KeyboardInput;
  private readonly cleanups: Array<() => void> = [];

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

  private get farm(): FarmState {
    const s = this.transport.getState();
    return s.farms[s.homeFarmId]!;
  }

  create(): void {
    this.pixelRatio = renderPixelRatio();
    generateTextures(this, this.transport.content);
    this.ground = this.add.graphics().setDepth(DEPTH.ground);
    this.highlight = this.add.graphics().setDepth(DEPTH.highlight);
    this.ghostShape = this.add.graphics().setDepth(DEPTH.ghost);
    this.ghostImage = this.add.image(0, 0, '__DEFAULT').setScale(1 / TEX_SCALE).setAlpha(0.65).setDepth(DEPTH.ghost + 1).setVisible(false);
    this.cameras.main.setBackgroundColor('#3d6b2a');

    this.syncState(this.transport.getState());
    this.fitCamera();

    this.cleanups.push(
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

  /** A different farm was loaded: drop every view and start from a fresh camera. */
  private onReset(): void {
    for (const view of this.views.values()) destroyView(view);
    this.views.clear();
    this.farmSize = { w: 0, h: 0 };
    this.tooltipTile = null;
    this.hoverTile = null;
    this.ghostTile = null;
    this.painted.clear();
    this.children.list.filter((o) => o.type === 'Text').forEach((o) => o.destroy()); // stray pop-ups
    this.syncState(this.transport.getState());
    this.fitCamera();
  }

  override update(_time: number, deltaMs: number): void {
    if (!this.inputEnabled) return;
    const v = this.keyboard.panVector();
    if (v.x || v.y) {
      const cam = this.cameras.main;
      const step = (KEY_PAN_SPEED * deltaMs) / 1000 / this.userZoom;
      cam.setScroll(cam.scrollX + v.x * step, cam.scrollY + v.y * step);
    }
  }

  /** Called by the game shell whenever the canvas is resized for a new device pixel ratio. */
  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
    this.cameras.main.setZoom(this.userZoom * ratio);
  }

  // ---------------------------------------------------------------- state -> views

  private syncState(state: GameState): void {
    const farm = state.farms[state.homeFarmId]!;
    if (farm.width !== this.farmSize.w || farm.height !== this.farmSize.h) this.rebuildGround(farm);

    const { gameNow } = state.clock;
    const seen = new Set<string>();
    for (const entity of Object.values(farm.entities)) {
      seen.add(entity.id);
      let view = this.views.get(entity.id);
      if (!view || view.kind !== entity.kind) {
        if (view) destroyView(view);
        view = createView(this, entity);
        this.views.set(entity.id, view);
      }
      updateView(this, view, entity, gameNow, state.rules, this.transport.content);
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
    const g = this.ground.clear();
    for (let ty = 0; ty < farm.height; ty++) {
      for (let tx = 0; tx < farm.width; tx++) {
        const { x, y } = tileToWorld(tx, ty);
        g.fillStyle((tx + ty) % 2 === 0 ? 0x7cb342 : 0x74a93d, 1);
        diamondPath(g, x, y, 1, 1);
        g.fillPath();
      }
    }
    // Farm edge
    const b = farmBounds(farm.width, farm.height);
    g.lineStyle(3, 0x5d4037, 0.8);
    g.beginPath();
    g.moveTo(0, b.top);
    g.lineTo(b.right, (b.top + b.bottom) / 2);
    g.lineTo(0, b.bottom);
    g.lineTo(b.left, (b.top + b.bottom) / 2);
    g.closePath();
    g.strokePath();

    this.cameras.main.setBounds(
      b.left - CAMERA_MARGIN,
      b.top - CAMERA_MARGIN,
      b.right - b.left + CAMERA_MARGIN * 2,
      b.bottom - b.top + CAMERA_MARGIN * 2,
    );
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
    if (onEntity && !this.holdingSomething()) this.showTooltip(tile, p, false);
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
    if (info.button === 1 || info.button === 2) return 'pan';
    const ui = this.ui.get();
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
    const tools: Record<string, UiState['tool']> = { '1': 'multi', '2': 'plow', '3': 'seed', '4': 'harvest', '5': 'move', '6': 'sell' };
    const tool = tools[key];
    if (tool) {
      if (tool === 'seed' && !ui.get().seedId) ui.set({ marketOpen: true, marketTab: 'seeds' });
      else selectTool(ui, tool);
      return;
    }
    switch (key) {
      case 'escape':
        return cancelTool(ui);
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
    if (s.movingEntityId !== prev.movingEntityId) {
      for (const [id, view] of this.views) setViewAlpha(view, id === s.movingEntityId ? 0.35 : 1);
    }
    if (s.tool !== prev.tool || s.movingEntityId !== prev.movingEntityId || s.placeItemId !== prev.placeItemId || s.rotated !== prev.rotated) {
      this.drawGhost();
      this.drawHighlight();
    }
  }

  // ---------------------------------------------------------------- actions

  private act(tile: Tile, p: Pt): void {
    const state = this.transport.getState();
    const farm = state.farms[state.homeFarmId]!;
    const ui = this.ui.get();
    const outcome = resolveTap(ui, farm, tile, state.clock.gameNow, state.rules, this.transport.content);

    switch (outcome.kind) {
      case 'command': {
        const { command, confirm } = outcome;
        if (confirm) {
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
      case 'inspect':
        this.showTooltip(tile, p, true);
        return;
      case 'none':
        return;
    }
  }

  private send(command: Command, tile: Tile, quiet = false): boolean {
    this.lastActionTile = tile;
    const result = this.transport.send(command);
    if (!result.ok) {
      if (!quiet || PAINT_REPORTED_ERRORS.has(result.error.code)) toast(this.ui, result.error.message, 'error');
      return false;
    }
    if (command.type === 'move') this.ui.set({ movingEntityId: null, rotated: false });
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
    const command = resolvePaint(this.ui.get(), state.farms[state.homeFarmId]!, tile, state.clock.gameNow, state.rules, this.transport.content);
    if (command) this.send(command, tile, true);
  }

  private playEvents(events: readonly GameEvent[]): void {
    let stack = 0;
    const at = (tile: Tile | null) => {
      const t = tile ?? this.lastActionTile ?? { x: 0, y: 0 };
      const w = tileToWorld(t.x, t.y);
      return { x: w.x, y: w.y - 10 - stack++ * 16 };
    };
    for (const e of events) {
      switch (e.type) {
        case 'plowed':
        case 'planted':
          if (e.cost > 0) this.float(at(e), `-${e.cost}`, 'cost');
          break;
        case 'harvested':
          if (e.coins > 0) this.float(at(e), `+${e.coins}`, 'coins');
          break;
        case 'placed':
          if (e.cost > 0) this.float(at(this.lastActionTile), `-${e.cost}`, 'cost');
          break;
        case 'sold':
          if (e.refund > 0) this.float(at(this.lastActionTile), `+${e.refund}`, 'coins');
          break;
        case 'xpGained':
          this.float(at(this.lastActionTile), `+${formatXp(e.amount)} XP`, 'xp', 120);
          break;
        case 'levelUp':
          toast(this.ui, `Level ${e.level}!${e.cashReward ? ` +${e.cashReward} Farm Cash` : ''}`, 'success');
          break;
        case 'moved':
          break;
      }
    }
  }

  private float(p: Pt, text: string, kind: 'coins' | 'cost' | 'xp', delay = 0): void {
    floatText(this, p.x, p.y, text, kind, delay);
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

  /** Footprint preview for placing or moving, green when it fits and red when it doesn't. */
  private drawGhost(): void {
    const g = this.ghostShape.clear();
    this.ghostImage.setVisible(false);
    const t = this.ghostTile;
    if (!t || !this.holdingSomething()) return;

    const ui = this.ui.get();
    const content = this.transport.content;
    const farm = this.farm;
    let itemId: string | null = null;
    let size = { w: 1, h: 1 };
    let ignoreId: string | undefined;

    if (ui.tool === 'place' && ui.placeItemId) {
      itemId = ui.placeItemId;
      size = itemSize(itemId, ui.rotated, content) ?? size;
    } else if (ui.movingEntityId) {
      const entity: Entity | undefined = lookup(farm.entities, ui.movingEntityId);
      if (!entity) return;
      ignoreId = entity.id;
      if (entity.kind === 'decoration') {
        itemId = entity.itemId;
        size = itemSize(itemId, ui.rotated, content) ?? size;
      } else {
        size = { w: footprintOf(entity, content).w, h: footprintOf(entity, content).h };
      }
    }

    const fits = placementProblem(farm, { x: t.x, y: t.y, ...size }, content, ignoreId) === null;
    const center = tileToWorld(t.x + (size.w - 1) / 2, t.y + (size.h - 1) / 2);
    g.fillStyle(fits ? 0x66bb6a : 0xef5350, 0.45);
    g.lineStyle(2, fits ? 0xc8e6c9 : 0xffcdd2, 1);
    diamondPath(g, center.x, center.y, size.w, size.h);
    g.fillPath();
    g.strokePath();

    if (itemId) {
      const item = lookup(content.decorations, itemId);
      const key = ensureDecorationTexture(this, itemId, item?.width ?? 1, item?.height ?? 1, ui.rotated);
      const origin = decorationOrigin(size.w, size.h, decorationArt(itemId).height);
      this.ghostImage.setTexture(key).setOrigin(origin.x, origin.y).setPosition(center.x, center.y).setVisible(true);
    }
  }

  private showTooltip(tile: Tile, p: Pt, includeGrass: boolean): void {
    const state = this.transport.getState();
    const farm = state.farms[state.homeFarmId]!;
    const desc = describeTile(farm, tile.x, tile.y, state.clock.gameNow, state.rules, this.transport.content);
    if (!desc || (!includeGrass && desc.title === 'Grass')) return this.hideTooltip();
    this.tooltipTile = tile;
    this.ui.set({ tooltip: { x: p.x, y: p.y, ...desc } });
  }

  private refreshTooltip(): void {
    const tip = this.ui.get().tooltip;
    if (!tip || !this.tooltipTile) return;
    const state = this.transport.getState();
    const farm = state.farms[state.homeFarmId]!;
    const desc = describeTile(farm, this.tooltipTile.x, this.tooltipTile.y, state.clock.gameNow, state.rules, this.transport.content);
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

function formatXp(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}
