import type { EntityId, PlayerId } from './ids';
import type { Medal } from './state';

/**
 * What happened as a result of a command. The renderer uses these for effects
 * (coin pops, sounds); in co-op the host broadcasts them to clients.
 */
export type GameEvent =
  | { type: 'plowed'; x: number; y: number; entityId: EntityId; cost: number }
  | { type: 'planted'; x: number; y: number; entityId: EntityId; cropId: string; cost: number }
  | { type: 'harvested'; x: number; y: number; entityId: EntityId; cropId: string; coins: number }
  /** A tree, animal or building's animals produced. `count` = animals collected (1 for trees/animals). */
  | { type: 'collected'; x: number; y: number; entityId: EntityId; itemId: string; coins: number; count: number }
  /** `cost` is 0 when placed from the gift box or storage. */
  | { type: 'placed'; entityId: EntityId; itemId: string; cost: number; x: number; y: number }
  | { type: 'sold'; entityId: EntityId; refund: number }
  | { type: 'itemSold'; itemId: string; refund: number }
  | { type: 'stored'; entityId: EntityId; itemId: string }
  | { type: 'moved'; entityId: EntityId; x: number; y: number; rotated: boolean }
  | { type: 'animalHoused'; buildingId: EntityId; itemId: string; x: number; y: number }
  | { type: 'xpGained'; playerId: PlayerId; amount: number }
  | { type: 'levelUp'; playerId: PlayerId; level: number; cashReward: number }
  | { type: 'masteryStar'; cropId: string; star: number; coins: number; xp: number }
  | { type: 'ribbonEarned'; ribbonId: string; tier: number }
  | { type: 'collectibleFound'; collectibleId: string; collectionId: string; x: number; y: number }
  | { type: 'collectionCompleted'; collectionId: string }
  | { type: 'itemReceived'; itemId: string; reason: RewardReason }
  | { type: 'vehicleBought'; vehicleId: string; cost: number }
  | { type: 'vehicleUsed'; vehicleId: string; tiles: number; fuel: number }
  | { type: 'refueled'; cash: number; fuel: number }
  | { type: 'farmExpanded'; size: number; cost: number }
  | { type: 'dailyBonus'; streak: number; coins: number; xp: number; cash: number }
  /** `refreshed`: ripe crops given a fresh ripe window so the change didn't wither them instantly. */
  | { type: 'rulesChanged'; refreshed: number }
  | { type: 'neighborHelped'; neighborId: string; x: number; y: number; coins: number; help: HelpKind }
  /** You used all of today's helps on this neighbour; they sent a thank-you gift. */
  | { type: 'neighborThanks'; neighborId: string; itemId: string | null }
  | { type: 'giftsAccepted'; items: { itemId: string; count: number }[] }
  | { type: 'supplyBought'; itemId: string; count: number; coins: number; cash: number }
  /** `affected`: crops changed (or fuel added for a fuel can). */
  | { type: 'supplyUsed'; itemId: string; affected: number; x: number | null; y: number | null }
  | { type: 'partsAdded'; entityId: EntityId; added: number; missing: number }
  | { type: 'constructionCompleted'; entityId: EntityId; itemId: string }
  | { type: 'contractStarted'; contractId: string }
  | { type: 'contractCompleted'; contractId: string; medal: Medal }
  | { type: 'contractClaimed'; contractId: string; medal: Medal; coins: number; xp: number; cash: number }
  | { type: 'contractFailed'; contractId: string }
  | { type: 'contractAbandoned'; contractId: string };

export type RewardReason = 'mastery' | 'collection' | 'gift' | 'contract' | 'baby';

/** What helping did on a neighbour's farm. */
export type HelpKind = 'fertilized' | 'unwithered' | 'picked' | 'fed';
