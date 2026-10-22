/** Which sound a game event makes (PLAN.md section 10, "Juice"). Pure, for tests. */
import type { GameEvent } from '../../core';
import type { SoundId } from '../../platform/audio';

export function soundFor(e: GameEvent): SoundId | null {
  switch (e.type) {
    case 'plowed':
      return 'plow';
    case 'planted':
      return 'plant';
    case 'harvested':
      return 'harvest';
    case 'collected':
      return 'collect';
    case 'placed':
      return e.cost > 0 ? 'buy' : 'build';
    case 'sold':
    case 'itemSold':
    case 'dailyBonus':
      return 'coins';
    case 'levelUp':
      return 'levelUp';
    case 'masteryStar':
    case 'ribbonEarned':
    case 'collectionCompleted':
    case 'contractClaimed':
    case 'contractCompleted':
      return 'medal';
    case 'collectibleFound':
    case 'itemReceived':
    case 'giftsAccepted':
    case 'neighborThanks':
      return 'gift';
    case 'vehicleBought':
    case 'supplyBought':
    case 'refueled':
      return 'buy';
    case 'vehicleUsed':
      return 'plow';
    case 'supplyUsed':
      return 'magic';
    case 'partsAdded':
    case 'constructionCompleted':
    case 'farmExpanded':
      return 'build';
    case 'neighborHelped':
      return 'help';
    case 'moved':
    case 'stored':
    case 'animalHoused':
      return 'tap';
    default:
      return null;
  }
}

/** The distinct sounds for a batch of events, most important first, at most three. */
export function soundsFor(events: readonly GameEvent[]): SoundId[] {
  const order: SoundId[] = ['levelUp', 'medal', 'gift', 'magic', 'build', 'harvest', 'collect', 'coins', 'buy', 'help', 'plant', 'plow', 'tap'];
  const found = new Set(events.map(soundFor).filter((s): s is SoundId => s !== null));
  return order.filter((s) => found.has(s)).slice(0, 3);
}
