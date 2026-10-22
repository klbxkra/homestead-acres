/**
 * First-time tutorial (PLAN.md Phase 7): a short coach card that walks a new
 * farmer through the main loop. Progress is kept per farm on this device (it's
 * guidance, not game state), and it only starts for farms created after this
 * version. The step logic is pure so tests can drive it with events.
 */
import type { GameEvent } from '../core';
import type { UiState } from './uiState';

export type TutorialStep = 'plow' | 'seeds' | 'plant' | 'neighbors' | 'harvest' | 'done';

export interface StepInfo {
  id: Exclude<TutorialStep, 'done'>;
  title: string;
  text: string;
  /** `data-tour` value of the button to point at. */
  target?: string;
}

export const TUTORIAL_STEPS: readonly StepInfo[] = [
  { id: 'plow', title: 'Plow a plot', text: 'Tap the grass with the ✋ Multi-tool. Your farmer walks over and plows it.', target: 'multi' },
  { id: 'seeds', title: 'Buy some seeds', text: 'Open the 🏪 Market and pick Strawberries: they grow the fastest.', target: 'market' },
  { id: 'plant', title: 'Plant them', text: 'Tap your plowed plot to plant. Each planting earns XP toward your next level.' },
  {
    id: 'neighbors',
    title: 'Meet the neighbors',
    text: 'While crops grow, open 👥 Neighbors, visit someone and tap a crop or animal to help. You earn coins, and they send gifts.',
    target: 'neighbors',
  },
  {
    id: 'harvest',
    title: 'Harvest when ripe',
    text: 'Ripe crops show their fruit. Tap them to harvest for coins. Hover (or press and hold) a plot to see how long is left.',
  },
];

export interface TutorialContext {
  /** No AI neighbors on these rules: that step is skipped. */
  hasNeighbors: boolean;
}

/** The step after `step`, skipping ones that don't apply. */
export function nextStep(step: TutorialStep, ctx: TutorialContext): TutorialStep {
  const order: TutorialStep[] = ['plow', 'seeds', 'plant', 'neighbors', 'harvest', 'done'];
  let i = order.indexOf(step) + 1;
  if (order[i] === 'neighbors' && !ctx.hasNeighbors) i++;
  return order[Math.min(i, order.length - 1)]!;
}

/** Does this game event finish the step? */
export function eventCompletes(step: TutorialStep, e: GameEvent): boolean {
  switch (step) {
    case 'plow':
      return e.type === 'plowed';
    case 'plant':
      return e.type === 'planted';
    case 'neighbors':
      return e.type === 'neighborHelped';
    case 'harvest':
      return e.type === 'harvested';
    default:
      return false;
  }
}

/** Does this UI state finish the step? */
export function uiCompletes(step: TutorialStep, ui: UiState): boolean {
  return step === 'seeds' && ui.seedId !== null && !ui.marketOpen;
}

const STEP_IDS: readonly TutorialStep[] = ['plow', 'seeds', 'plant', 'neighbors', 'harvest', 'done'];

/** Where tutorial progress is kept (localStorage, or memory in tests). */
export class TutorialProgress {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null) {}

  private key(slotId: string): string {
    return `homestead-acres:tutorial:${slotId}`;
  }

  /** null = no tutorial for this farm. */
  get(slotId: string): TutorialStep | null {
    try {
      const v = this.storage?.getItem(this.key(slotId)) ?? null;
      return STEP_IDS.includes(v as TutorialStep) ? (v as TutorialStep) : null;
    } catch {
      return null;
    }
  }

  set(slotId: string, step: TutorialStep): void {
    try {
      this.storage?.setItem(this.key(slotId), step);
    } catch {
      // storage blocked: the tutorial just won't remember where it was
    }
  }

  forget(slotId: string): void {
    try {
      this.storage?.removeItem(this.key(slotId));
    } catch {
      // ignore
    }
  }
}
