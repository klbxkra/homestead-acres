/**
 * Progress beyond levels (PLAN.md section 4.7): ribbons, crop mastery and
 * collections, plus the shared way every reward is paid out.
 */
import type { Reward } from '../content';
import { bump, pickIndex, reject, roll } from './context';
import type { Ctx, Tile } from './context';
import { masteryThresholds } from './economy';
import { lookup } from './ids';
import { gainXp } from './progression';

/** Counter names that ribbons can track. */
export type CounterName =
  | 'plowed'
  | 'cropsHarvested'
  | 'treesHarvested'
  | 'animalsCollected'
  | 'itemsBought'
  | 'coinsEarned'
  | 'cropsMastered'
  | 'collectionsCompleted';

/**
 * Pays a reward: coins as listed, XP through the xpGain rule, Farm Cash through
 * farmCashEarnRate, and an item into the gift box.
 */
export function grantReward(ctx: Ctx, reward: Partial<Reward>, reason: 'mastery' | 'collection' | 'gift'): void {
  const { player, rules, content } = ctx;
  player.coins += reward.coins ?? 0;
  player.cash += Math.round((reward.cash ?? 0) * rules.farmCashEarnRate);
  if (reward.itemId) {
    bump(player.giftBox, reward.itemId);
    ctx.events.push({ type: 'itemReceived', itemId: reward.itemId, reason });
  }
  gainXp(player, (reward.xp ?? 0) * rules.xpGain, content.levels, rules, ctx.events);
}

/** Increments a counter and awards any ribbon tiers it reaches (several at once if needed). */
export function addCounter(ctx: Ctx, counter: CounterName, amount = 1): void {
  if (amount <= 0) return;
  const value = bump(ctx.player.stats.counters, counter, amount);
  for (const ribbon of ctx.content.ribbons) {
    if (ribbon.counter !== counter) continue;
    let tier = lookup(ctx.player.ribbons, ribbon.id) ?? 0;
    while (tier < ribbon.tiers.length && value >= ribbon.tiers[tier]!) {
      tier++;
      ctx.player.ribbons[ribbon.id] = tier;
      ctx.events.push({ type: 'ribbonEarned', ribbonId: ribbon.id, tier });
      const reward = ctx.content.base.ribbonRewards[tier - 1];
      if (reward) grantReward(ctx, reward, 'gift');
    }
  }
}

/** Records a crop harvest for mastery and pays any stars it reaches. */
export function recordCropHarvest(ctx: Ctx, cropId: string, coinsEarned: number): void {
  const { player, content, rules } = ctx;
  const harvested = bump(player.stats.harvested, cropId);
  addCounter(ctx, 'cropsHarvested');
  addCounter(ctx, 'coinsEarned', coinsEarned);

  const crop = lookup(content.crops, cropId);
  if (!crop) return;
  const thresholds = masteryThresholds(crop, rules);
  let stars = lookup(player.masteryStars, cropId) ?? 0;
  const m = content.base.mastery;
  while (stars < 3 && harvested >= thresholds[stars]!) {
    stars++;
    player.masteryStars[cropId] = stars;
    const coins = Math.round(crop.sellPrice * m.coinsPerStarFactor * stars);
    const xp = m.xpPerStar * stars;
    ctx.events.push({ type: 'masteryStar', cropId, star: stars, coins, xp: xp * rules.xpGain });
    grantReward(ctx, { coins, xp, ...(stars === 3 ? { itemId: m.rewardItemId } : {}) }, 'mastery');
    if (stars === 3) addCounter(ctx, 'cropsMastered');
  }
}

export function isMastered(ctx: Pick<Ctx, 'player'>, cropId: string): boolean {
  return (lookup(ctx.player.masteryStars, cropId) ?? 0) >= 3;
}

export type CollectibleSource = { crop: string } | { tree: true } | { animal: true } | { plow: true };

/** Rolls for a collectible from every collection that drops from this source. */
export function rollCollectibles(ctx: Ctx, source: CollectibleSource, at: Tile): void {
  const p = ctx.content.base.collectibleChance * ctx.rules.collectibleDropRate;
  if (p <= 0) return;
  for (const set of ctx.content.collections) {
    const s = set.sources;
    const eligible =
      ('crop' in source && s.crops.includes(source.crop)) ||
      ('tree' in source && s.trees) ||
      ('animal' in source && s.animals) ||
      ('plow' in source && s.plow);
    if (!eligible || !roll(ctx, Math.min(1, p))) continue;
    const item = set.items[pickIndex(ctx, set.items.length)]!;
    bump(ctx.player.collectibles, item.id);
    ctx.events.push({ type: 'collectibleFound', collectibleId: item.id, collectionId: set.id, x: at.x, y: at.y });
  }
}

/** Trades one of each collectible in a set for its reward. */
export function turnInCollection(ctx: Ctx, collectionId: string): void {
  const set = ctx.content.collections.find((c) => c.id === collectionId) ?? reject('unknown_item', 'Unknown collection.');
  const owned = ctx.player.collectibles;
  const missing = set.items.filter((i) => (lookup(owned, i.id) ?? 0) < 1);
  if (missing.length) reject('incomplete', `Still missing: ${missing.map((i) => i.name).join(', ')}.`);
  for (const i of set.items) owned[i.id] = owned[i.id]! - 1;
  ctx.events.push({ type: 'collectionCompleted', collectionId });
  grantReward(ctx, set.reward, 'collection');
  addCounter(ctx, 'collectionsCompleted');
}
