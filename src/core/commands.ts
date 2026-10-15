import type { EntityId, FarmId, PlayerId } from './ids';

export type InventorySource = 'giftBox' | 'storage';

/** Every way a player can change the game (PLAN.md principle 2). Plain data, so it can go over a network. */
export type Command =
  | { type: 'plow'; x: number; y: number }
  | { type: 'plant'; x: number; y: number; cropId: string }
  /** Harvest a crop, tree, animal or every ready animal in a building. */
  | { type: 'harvest'; x: number; y: number }
  /** Buy any placeable (decoration, tree, animal, building). Animals bought onto a matching building move in. */
  | { type: 'buy'; itemId: string; x: number; y: number; rotated?: boolean }
  | { type: 'sell'; entityId: EntityId }
  /** Move an entity; moving an animal onto a matching building houses it. */
  | { type: 'move'; entityId: EntityId; x: number; y: number; rotated?: boolean }
  /** Put a farm item into storage. */
  | { type: 'store'; entityId: EntityId }
  /** Place an item from the gift box or storage. */
  | { type: 'place'; itemId: string; from: InventorySource; x: number; y: number; rotated?: boolean }
  /** Sell one item from the gift box or storage. */
  | { type: 'sellItem'; itemId: string; from: InventorySource }
  | { type: 'buyVehicle'; vehicleId: string }
  /** Run a vehicle over an area x area square whose top corner is (x, y). */
  | { type: 'useVehicle'; vehicleId: string; x: number; y: number; cropId?: string }
  /** Fill the fuel tank with Farm Cash. */
  | { type: 'refuel' }
  | { type: 'expandFarm' }
  | { type: 'turnInCollection'; collectionId: string }
  | { type: 'claimDailyBonus' }
  /** Replace the world rules. Untrusted input: validated by the reducer. */
  | { type: 'setRules'; rules: unknown };

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
  | 'insufficient_cash'
  | 'unknown_entity'
  | 'not_in_inventory'
  | 'storage_full'
  | 'not_empty'
  | 'building_full'
  | 'not_owned'
  | 'already_owned'
  | 'no_fuel'
  | 'nothing_to_do'
  | 'max_size'
  | 'incomplete'
  | 'not_ready';

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}
