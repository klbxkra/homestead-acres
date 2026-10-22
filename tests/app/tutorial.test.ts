import { describe, expect, it } from 'vitest';
import { eventCompletes, nextStep, TutorialProgress, uiCompletes } from '../../src/app/tutorial';
import { initialUiState } from '../../src/app/uiState';

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('tutorial', () => {
  it('goes plow -> seeds -> plant -> neighbors -> harvest -> done', () => {
    const ctx = { hasNeighbors: true };
    const seen = ['plow'];
    let step = nextStep('plow', ctx);
    while (step !== 'done') {
      seen.push(step);
      step = nextStep(step, ctx);
    }
    expect(seen).toEqual(['plow', 'seeds', 'plant', 'neighbors', 'harvest']);
  });

  it('skips the neighbor step when the rules have no neighbors', () => {
    expect(nextStep('plant', { hasNeighbors: false })).toBe('harvest');
  });

  it('completes steps from game events and UI state', () => {
    expect(eventCompletes('plow', { type: 'plowed', x: 0, y: 0, entityId: 'p', cost: 15 })).toBe(true);
    expect(eventCompletes('plow', { type: 'planted', x: 0, y: 0, entityId: 'p', cropId: 'x', cost: 1 })).toBe(false);
    expect(eventCompletes('neighbors', { type: 'neighborHelped', neighborId: 'n', x: 0, y: 0, coins: 10, help: 'fed' })).toBe(true);
    const ui = initialUiState();
    expect(uiCompletes('seeds', ui)).toBe(false);
    expect(uiCompletes('seeds', { ...ui, seedId: 'strawberry', marketOpen: true })).toBe(false); // still choosing
    expect(uiCompletes('seeds', { ...ui, seedId: 'strawberry' })).toBe(true);
  });

  it('remembers progress per farm and tolerates broken storage', () => {
    const p = new TutorialProgress(new FakeStorage());
    expect(p.get('a')).toBeNull();
    p.set('a', 'plant');
    expect(p.get('a')).toBe('plant');
    expect(p.get('b')).toBeNull();
    p.forget('a');
    expect(p.get('a')).toBeNull();
    const broken = new TutorialProgress({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    });
    expect(broken.get('a')).toBeNull();
    expect(() => broken.set('a', 'plow')).not.toThrow();
  });
});
