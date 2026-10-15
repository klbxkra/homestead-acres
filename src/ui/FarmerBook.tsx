import type { Session } from '../app/session';
import { toast } from '../app/uiState';
import type { BookTab } from '../app/uiState';
import { lookup, masteryThresholds } from '../core';
import type { GameState, PlayerState } from '../core';
import { cropArt } from '../game/art/artData';
import { formatNumber } from './format';
import { useGameState, useStore } from './hooks';

const TABS: { id: BookTab; label: string }[] = [
  { id: 'mastery', label: '⭐ Mastery' },
  { id: 'ribbons', label: '🎀 Ribbons' },
  { id: 'collections', label: '🦋 Collections' },
];

export const RIBBON_NAMES = ['Yellow', 'White', 'Red', 'Blue'];
const RIBBON_COLORS = ['#fdd835', '#f5f5f5', '#e53935', '#1e88e5'];

/** Mastery stars, ribbons and collections in one place. */
export function FarmerBook({ session }: { session: Session }) {
  const { ui, transport } = session;
  const s = useStore(ui);
  const state = useGameState(transport);
  if (s.panel !== 'book') return null;
  const player = state.players[state.localPlayerId]!;
  const close = () => ui.set({ panel: null });

  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="market" role="dialog" aria-label="Farmer's book" onClick={(e) => e.stopPropagation()}>
        <div class="market-header">
          <h2>Farmer's Book</h2>
          <div class="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={s.bookTab === t.id} class={`tab ${s.bookTab === t.id ? 'active' : ''}`} onClick={() => ui.set({ bookTab: t.id })}>
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" class="close-btn" aria-label="Close" onClick={close}>
            ✖
          </button>
        </div>
        <div class="book-body">
          {s.bookTab === 'mastery' && <MasteryList session={session} state={state} player={player} />}
          {s.bookTab === 'ribbons' && <RibbonList session={session} player={player} />}
          {s.bookTab === 'collections' && <CollectionList session={session} player={player} />}
        </div>
      </div>
    </div>
  );
}

function MasteryList({ session, state, player }: { session: Session; state: GameState; player: PlayerState }) {
  const content = session.transport.content;
  const crops = Object.values(content.crops).sort((a, b) => a.unlockLevel - b.unlockLevel);
  const pct = Math.round(content.base.mastery.seedDiscount * 100);
  return (
    <>
      <p class="settings-intro">Harvest a crop enough times to earn 3 stars. Each star pays coins and XP; mastered crops get {pct}% off seeds and a Mastery Sign.</p>
      <div class="book-rows">
        {crops.map((crop) => {
          const locked = player.level < crop.unlockLevel;
          const harvested = player.stats.harvested[crop.id] ?? 0;
          const stars = player.masteryStars[crop.id] ?? 0;
          const goals = masteryThresholds(crop, state.rules);
          const goal = stars < 3 ? goals[stars]! : goals[2];
          const prev = stars === 0 ? 0 : goals[stars - 1]!;
          const progress = stars >= 3 ? 1 : (harvested - prev) / Math.max(1, goal - prev);
          return (
            <div key={crop.id} class={`book-row ${locked ? 'locked' : ''}`}>
              <span class="swatch small" style={{ background: cropArt(crop.id).css }} />
              <span class="book-name">{crop.name}</span>
              <span class="stars" aria-label={`${stars} of 3 stars`}>
                {'★'.repeat(stars)}
                <span class="stars-empty">{'☆'.repeat(3 - stars)}</span>
              </span>
              <span class="book-progress">
                <span class="bar">
                  <span class="bar-fill" style={{ width: `${Math.min(100, progress * 100)}%` }} />
                </span>
                <small>{locked ? `Level ${crop.unlockLevel}` : stars >= 3 ? 'Mastered!' : `${formatNumber(harvested)} / ${formatNumber(goal)}`}</small>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RibbonList({ session, player }: { session: Session; player: PlayerState }) {
  const content = session.transport.content;
  return (
    <div class="book-rows">
      {content.ribbons.map((r) => {
        const tier = player.ribbons[r.id] ?? 0;
        const value = player.stats.counters[r.counter] ?? 0;
        const next = r.tiers[tier];
        const prev = tier === 0 ? 0 : r.tiers[tier - 1]!;
        const progress = next === undefined ? 1 : (value - prev) / Math.max(1, next - prev);
        return (
          <div key={r.id} class="book-row">
            <span class="ribbon" style={{ background: tier ? RIBBON_COLORS[tier - 1] : '#d7ccc8' }} aria-hidden="true">
              🎀
            </span>
            <span class="book-name">
              {r.name}
              <small>{r.description}</small>
            </span>
            <span class="book-tier">{tier ? `${RIBBON_NAMES[tier - 1]}` : 'None yet'}</span>
            <span class="book-progress">
              <span class="bar">
                <span class="bar-fill" style={{ width: `${Math.min(100, Math.max(0, progress) * 100)}%` }} />
              </span>
              <small>
                {next === undefined ? 'All ribbons earned!' : `${formatNumber(value)} / ${formatNumber(next)} for ${RIBBON_NAMES[tier]}`}
              </small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CollectionList({ session, player }: { session: Session; player: PlayerState }) {
  const { transport, ui } = session;
  const content = transport.content;
  const turnIn = (collectionId: string) => {
    const result = transport.send({ type: 'turnInCollection', collectionId });
    if (!result.ok) toast(ui, result.error.message, 'error');
  };
  return (
    <>
      <p class="settings-intro">Collectibles turn up while you farm. Complete a set and turn it in for a reward.</p>
      <div class="collections">
        {content.collections.map((c) => {
          const complete = c.items.every((i) => (player.collectibles[i.id] ?? 0) > 0);
          const source = c.sources.plow
            ? 'Found while plowing'
            : c.sources.trees
              ? 'Found while harvesting trees'
              : `Found harvesting ${c.sources.crops.slice(0, 3).map((id) => lookup(content.crops, id)?.name).join(', ')}${c.sources.crops.length > 3 ? '…' : ''}${c.sources.animals ? ' and animals' : ''}`;
          const rewardItem = c.reward.itemId ? lookup(content.placeables, c.reward.itemId)?.name : null;
          return (
            <div key={c.id} class="collection">
              <div class="collection-head">
                <b>{c.name}</b>
                <small class="muted">{source}</small>
              </div>
              <div class="collection-items">
                {c.items.map((i) => {
                  const n = player.collectibles[i.id] ?? 0;
                  return (
                    <span key={i.id} class={`collectible ${n ? 'have' : ''}`} title={i.name}>
                      <span>{n ? '✨' : '❔'}</span>
                      <small>{i.name}</small>
                      {n > 1 && <span class="badge">×{n}</span>}
                    </span>
                  );
                })}
              </div>
              <div class="collection-foot">
                <small>
                  Reward: 🪙 {formatNumber(c.reward.coins)} · {c.reward.xp} XP{c.reward.cash ? ` · 💵 ${c.reward.cash}` : ''}
                  {rewardItem ? ` · ${rewardItem}` : ''}
                </small>
                <button type="button" class="btn btn-small btn-primary" disabled={!complete} onClick={() => turnIn(c.id)}>
                  Turn in
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
