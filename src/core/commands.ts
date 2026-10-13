import type { EntityId, FarmId, PlayerId } from './ids';

/** Every way a player can change the game (PLAN.md principle 2). Plain data, so it can go over a network. */
export type Command =
  | { type: 'plow'; x: number; y: number }
  | { type: 'plant'; x: number; y: number; cropId: string }
  | { type: 'harvest'; x: number; y: number }
  | { type: 'buy'; itemId: string; x: number; y: number; rotated?: boolean }
  | { type: 'sell'; entityId: EntityId }
  | { type: 'move'; entityId: EntityId; x: number; y: number; rotated?: boolean };

export type CommandType = Command['type'];

/** Who is acting on which farm. clientSeq lets a co-op client match replies to its requests. */
export interface CommandEnvelope {
  playerId: PlayerId;
  farmId: FarmId;
  clientSeq?: number;
  command: Command;
}

export type CommandErrorCode =
  | 'invalid'
  | 'unknown_player'
  | 'unknown_farm'
  | 'not_allowed'
  | 'out_of_bounds'
  | 'occupied'
  | 'already_plowed'
  | 'not_plowed'
  | 'no_crop'
  | 'not_ripe'
  | 'withered'
  | 'unknown_item'
  | 'locked'
  | 'insufficient_coins'
  | 'unknown_entity';

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}
