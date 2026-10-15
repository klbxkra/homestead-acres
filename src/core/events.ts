import type { EntityId, PlayerId } from './ids';

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
  | { type: 'itemReceived'; itemId: string; reason: 'mastery' | 'collection' | 'gift' }
  | { type: 'vehicleBought'; vehicleId: string; cost: number }
  | { type: 'vehicleUsed'; vehicleId: string; tiles: number; fuel: number }
  | { type: 'refueled'; cash: number; fuel: number }
  | { type: 'farmExpanded'; size: number; cost: number }
  | { type: 'dailyBonus'; streak: number; coins: number; xp: number; cash: number }
  /** `refreshed`: ripe crops given a fresh ripe window so the change didn't wither them instantly. */
  | { type: 'rulesChanged'; refreshed: number };
