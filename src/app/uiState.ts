import { createStore } from './store';
import type { Store } from './store';

/** Interaction state that is not part of the game save: current tool, open menus, popups. */

export type ToolId = 'multi' | 'plow' | 'seed' | 'harvest' | 'move' | 'sell' | 'place' | 'store' | 'vehicle' | 'supply';
export type MarketTab = 'seeds' | 'trees' | 'animals' | 'buildings' | 'decor' | 'supplies' | 'vehicles' | 'expand';
export type PlaceSource = 'market' | 'giftBox' | 'storage';
/** Side panels other than the market. */
export type PanelId = 'inventory' | 'book' | 'neighbors';
export type BookTab = 'mastery' | 'ribbons' | 'collections';
export type NeighborsTab = 'neighbors' | 'mailbox' | 'jobs';

export interface Tooltip {
  /** CSS pixels relative to the viewport. */
  x: number;
  y: number;
  title: string;
  lines: string[];
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export interface UiState {
  tool: ToolId;
  /** Crop planted by the seed tool and by the multi-tool on plowed plots. */
  seedId: string | null;
  /** Item being placed with the place tool, and where it comes from. */
  placeItemId: string | null;
  placeFrom: PlaceSource;
  /** Entity picked up by the move tool. */
  movingEntityId: string | null;
  /** Vehicle driven by the vehicle tool. */
  vehicleId: string | null;
  /** Supply (Fertilizer, Instagrow) aimed with the supply tool. */
  supplyId: string | null;
  rotated: boolean;
  /** When on, a one-finger drag applies the tool to every plot it crosses instead of panning. */
  paint: boolean;
  marketOpen: boolean;
  marketTab: MarketTab;
  panel: PanelId | null;
  bookTab: BookTab;
  neighborsTab: NeighborsTab;
  /** Neighbour whose farm is on screen, or null at home. */
  visiting: string | null;
  /** Construction building whose parts dialog is open. */
  constructionId: string | null;
  tooltip: Tooltip | null;
  toasts: Toast[];
  confirm: ConfirmRequest | null;
}

export type UiStore = Store<UiState>;

export function initialUiState(): UiState {
  return {
    tool: 'multi',
    seedId: null,
    placeItemId: null,
    placeFrom: 'market',
    movingEntityId: null,
    vehicleId: null,
    supplyId: null,
    rotated: false,
    paint: false,
    marketOpen: false,
    marketTab: 'seeds',
    panel: null,
    bookTab: 'mastery',
    neighborsTab: 'neighbors',
    visiting: null,
    constructionId: null,
    tooltip: null,
    toasts: [],
    confirm: null,
  };
}

export function createUiStore(): UiStore {
  return createStore<UiState>(initialUiState());
}

/** Paint mode only makes sense for tools that act on many plots. */
export const PAINT_TOOLS: readonly ToolId[] = ['multi', 'plow', 'seed', 'harvest'];

export function selectTool(ui: UiStore, tool: ToolId): void {
  const s = ui.get();
  ui.set({
    tool,
    movingEntityId: null,
    placeItemId: tool === 'place' ? s.placeItemId : null,
    vehicleId: tool === 'vehicle' ? s.vehicleId : null,
    supplyId: tool === 'supply' ? s.supplyId : null,
    rotated: false,
    tooltip: null,
  });
}

export function selectSeed(ui: UiStore, seedId: string): void {
  // Keep driving the seeder/combine if one is selected; otherwise switch to the seed tool.
  const keepVehicle = ui.get().tool === 'vehicle';
  ui.set({ tool: keepVehicle ? 'vehicle' : 'seed', seedId, movingEntityId: null, placeItemId: null, marketOpen: false, tooltip: null });
}

export function startPlacing(ui: UiStore, itemId: string, from: PlaceSource = 'market'): void {
  ui.set({ tool: 'place', placeItemId: itemId, placeFrom: from, movingEntityId: null, rotated: false, marketOpen: false, panel: null, tooltip: null });
}

export function startVehicle(ui: UiStore, vehicleId: string): void {
  ui.set({ tool: 'vehicle', vehicleId, movingEntityId: null, placeItemId: null, marketOpen: false, tooltip: null });
}

/** Aim an area supply (Fertilizer, Instagrow) at the farm. */
export function startSupply(ui: UiStore, supplyId: string): void {
  ui.set({ tool: 'supply', supplyId, movingEntityId: null, placeItemId: null, vehicleId: null, marketOpen: false, panel: null, tooltip: null });
}

/** Go and look at a neighbour's farm (null = back home). */
export function visitNeighbor(ui: UiStore, neighborId: string | null): void {
  ui.set({
    visiting: neighborId,
    tool: 'multi',
    movingEntityId: null,
    placeItemId: null,
    vehicleId: null,
    supplyId: null,
    paint: false,
    marketOpen: false,
    panel: null,
    constructionId: null,
    tooltip: null,
  });
}

/** Esc / right-click: drop whatever is held, then fall back to the multi-tool. */
export function cancelTool(ui: UiStore): void {
  const s = ui.get();
  if (s.confirm) return ui.set({ confirm: null });
  if (s.marketOpen) return ui.set({ marketOpen: false });
  if (s.panel) return ui.set({ panel: null });
  if (s.constructionId) return ui.set({ constructionId: null });
  if (s.visiting) return visitNeighbor(ui, null);
  if (s.tool === 'move' && s.movingEntityId) return ui.set({ movingEntityId: null, rotated: false });
  selectTool(ui, 'multi');
}

let nextToastId = 1;
const TOAST_MS = 2600;

export function toast(ui: UiStore, text: string, kind: Toast['kind'] = 'info'): void {
  const id = nextToastId++;
  // Collapse repeats of the same message (e.g. painting over many invalid plots).
  const toasts = ui.get().toasts.filter((t) => t.text !== text).slice(-3);
  ui.set({ toasts: [...toasts, { id, text, kind }] });
  setTimeout(() => ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), TOAST_MS);
}
