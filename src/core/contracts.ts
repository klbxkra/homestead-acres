/**
 * Solo co-op jobs (PLAN.md section 4.8): grow a set of crops before time runs
 * out, with AI neighbours chipping in each game day. Finishing sooner earns a
 * better medal. Progress is kept per participant, so real co-op can reuse this
 * unchanged with other players as partners.
 */
import type { Content, ContractDef } from '../content';
import { bump, reject } from './context';
import type { Ctx } from './context';
import { contractDurationMs } from './economy';
import { lookup } from './ids';
import { addCounter, grantReward } from './rewards';
import type { ActiveContract, Medal, PlayerState } from './state';

export type ContractStatus = 'active' | 'complete' | 'failed';

export function contractDef(content: Content, contractId: string): ContractDef | undefined {
  return content.contracts.find((c) => c.id === contractId);
}

export function contractStatus(contract: ActiveContract, now: number): ContractStatus {
  if (contract.completedAt !== null) return 'complete';
  return now >= contract.endsAt ? 'failed' : 'active';
}

/** Harvests toward one crop goal from everyone taking part. */
export function contractTotal(contract: ActiveContract, cropId: string): number {
  return Object.values(contract.progress).reduce((sum, p) => sum + (lookup(p, cropId) ?? 0), 0);
}

/** Medal for finishing at `completedAt`: gold in the first half of the time, silver by three quarters, else bronze. */
export function medalFor(contract: ActiveContract, completedAt: number, content: Content): Medal {
  const share = (completedAt - contract.startedAt) / Math.max(1, contract.endsAt - contract.startedAt);
  const c = content.base.contracts;
  if (share <= c.goldWithin) return 'gold';
  return share <= c.silverWithin ? 'silver' : 'bronze';
}

/** What a medal pays: the full reward for gold, a fraction of the coins and XP otherwise (the item is gold-only). */
export function medalReward(def: ContractDef, medal: Medal, content: Content): { coins: number; xp: number; cash: number; itemId?: string } {
  if (medal === 'gold') return { coins: def.reward.coins, xp: def.reward.xp, cash: def.reward.cash, ...(def.reward.itemId ? { itemId: def.reward.itemId } : {}) };
  const f = medal === 'silver' ? content.base.contracts.silverRewardFactor : content.base.contracts.bronzeRewardFactor;
  return { coins: Math.round(def.reward.coins * f), xp: Math.round(def.reward.xp * f), cash: 0 };
}

export function startContract(ctx: Ctx, contractId: string, partners: readonly string[] = []): void {
  const { player, content, rules } = ctx;
  if (player.contract) reject('busy', 'Finish, claim or abandon your current co-op job first.');
  const def = contractDef(content, contractId) ?? reject('unknown_item', 'Unknown co-op job.');
  if (player.level < def.unlockLevel) reject('locked', `${def.name} unlocks at level ${def.unlockLevel}.`);
  if (!Array.isArray(partners)) reject('invalid', 'Partners must be a list.');
  const unique = [...new Set(partners)];
  if (unique.length > content.base.contracts.maxPartners) reject('invalid', `At most ${content.base.contracts.maxPartners} neighbors can help.`);
  const known = new Set(player.social.neighbors.slice(0, rules.aiNeighborCount).map((n) => n.id));
  for (const p of unique) if (typeof p !== 'string' || !known.has(p)) reject('invalid', 'That neighbor can\'t join.');

  player.contract = {
    contractId,
    startedAt: ctx.now,
    endsAt: ctx.now + contractDurationMs(def, rules),
    partners: unique,
    progress: {},
    completedAt: null,
  };
  ctx.events.push({ type: 'contractStarted', contractId });
}

/** Counts a harvest toward the active job (only up to each goal). */
export function recordContractHarvest(ctx: Ctx, cropId: string): void {
  const c = ctx.player.contract;
  if (!c || contractStatus(c, ctx.now) !== 'active') return;
  const def = contractDef(ctx.content, c.contractId);
  const goal = def?.goals.find((g) => g.cropId === cropId);
  if (!def || !goal || contractTotal(c, cropId) >= goal.count) return;
  c.progress[ctx.player.id] ??= {};
  bump(c.progress[ctx.player.id]!, cropId);
  checkComplete(ctx, c, def, ctx.now);
}

/** A game day begins: each AI partner grows their share of every unfinished goal. */
export function contractPartnersWork(ctx: Ctx, dayStart: number): void {
  const c = ctx.player.contract;
  if (!c || c.completedAt !== null || dayStart <= c.startedAt || dayStart > c.endsAt) return;
  const def = contractDef(ctx.content, c.contractId);
  if (!def) return;
  const share = ctx.content.base.contracts.partnerDailyShare;
  for (const partner of c.partners) {
    for (const goal of def.goals) {
      const left = goal.count - contractTotal(c, goal.cropId);
      const grown = Math.min(left, Math.ceil(goal.count * share));
      if (grown <= 0) continue;
      c.progress[partner] ??= {};
      bump(c.progress[partner]!, goal.cropId, grown);
    }
  }
  checkComplete(ctx, c, def, dayStart);
}

function checkComplete(ctx: Ctx, c: ActiveContract, def: ContractDef, at: number): void {
  if (c.completedAt !== null || !def.goals.every((g) => contractTotal(c, g.cropId) >= g.count)) return;
  c.completedAt = at;
  ctx.events.push({ type: 'contractCompleted', contractId: c.contractId, medal: medalFor(c, at, ctx.content) });
}

/** Pays a finished job (and records the medal), or clears one that ran out of time. */
export function claimContract(ctx: Ctx): void {
  const { player, content } = ctx;
  const c = player.contract ?? reject('nothing_to_do', 'You have no co-op job.');
  const status = contractStatus(c, ctx.now);
  if (status === 'active') reject('not_ready', 'This job isn\'t finished yet.');
  player.contract = null;
  const def = contractDef(content, c.contractId);
  if (status === 'failed' || !def) {
    ctx.events.push({ type: 'contractFailed', contractId: c.contractId });
    return;
  }
  const medal = medalFor(c, c.completedAt!, content);
  const reward = medalReward(def, medal, content);
  if (isBetter(medal, lookup(player.contractMedals, def.id))) player.contractMedals[def.id] = medal;
  ctx.events.push({
    type: 'contractClaimed',
    contractId: def.id,
    medal,
    coins: reward.coins,
    xp: reward.xp * ctx.rules.xpGain,
    cash: Math.round(reward.cash * ctx.rules.farmCashEarnRate),
  });
  grantReward(ctx, reward, 'contract');
  addCounter(ctx, 'contractsCompleted');
}

export function abandonContract(ctx: Ctx): void {
  const c = ctx.player.contract ?? reject('nothing_to_do', 'You have no co-op job.');
  ctx.player.contract = null;
  ctx.events.push({ type: 'contractAbandoned', contractId: c.contractId });
}

const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };

function isBetter(medal: Medal, previous: Medal | undefined): boolean {
  return !previous || MEDAL_RANK[medal] > MEDAL_RANK[previous];
}

/** Jobs the player can start now, in unlock order. */
export function availableContracts(player: PlayerState, content: Content): ContractDef[] {
  return content.contracts.filter((c) => c.unlockLevel <= player.level);
}
