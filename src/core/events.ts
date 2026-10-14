import type { EntityId, PlayerId } from './ids';

/**
 * What happened as a result of a command. The renderer uses these for effects
 * (coin pops, sounds); in co-op the host broadcasts them to clients.
 */
export type GameEvent =
  | { type: 'plowed'; x: number; y: number; entityId: EntityId; cost: number }
  | { type: 'planted'; x: number; y: number; entityId: EntityId; cropId: string; cost: number }
  | { type: 'harvested'; x: number; y: number; entityId: EntityId; cropId: string; coins: number }
  | { type: 'placed'; entityId: EntityId; itemId: string; cost: number }
  | { type: 'sold'; entityId: EntityId; refund: number }
  | { type: 'moved'; entityId: EntityId; x: number; y: number; rotated: boolean }
  | { type: 'xpGained'; playerId: PlayerId; amount: number }
  | { type: 'levelUp'; playerId: PlayerId; level: number; cashReward: number }
  /** `refreshed`: ripe crops given a fresh ripe window so the change didn't wither them instantly. */
  | { type: 'rulesChanged'; refreshed: number };
