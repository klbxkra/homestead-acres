import type { Session } from '../app/session';
import { selectSeed, startPlacing, startVehicle, toast } from '../app/uiState';
import type { MarketTab } from '../app/uiState';
import type { Content, PlaceableInfo } from '../content';
import {
  animalCycleMs,
  cropGrowMs,
  cropHarvestCoins,
  cropPlantXp,
  cropSeedCost,
  expansionCost,
  isMastered,
  itemCost,
  itemXp,
  lookup,
  nextExpansion,
  productionYield,
  supplyPrice,
  treeCycleMs,
  vehicleCost,
} from '../core';
import type { GameState, PlayerState, WorldRules } from '../core';
import { cropArt, itemArtCss, itemIcon } from '../game/art/artData';
import { formatDuration, formatNumber } from './format';
import { useGameState, useStore } from './hooks';

const TABS: { id: MarketTab; icon: string; label: string }[] = [
  { id: 'seeds', icon: '🌱', label: 'Seeds' },
  { id: 'trees', icon: '🌳', label: 'Trees' },
  { id: 'animals', icon: '🐔', label: 'Animals' },
  { id: 'buildings', icon: '🏠', label: 'Buildings' },
  { id: 'decor', icon: '🌼', label: 'Decor' },
  { id: 'supplies', icon: '🧪', label: 'Supplies' },
  { id: 'vehicles', icon: '🚜', label: 'Vehicles' },
  { id: 'expand', icon: '📐', label: 'Expand' },
];

export function Market({ session }: { session: Session }) {
  const { ui, transport } = session;
  const s = useStore(ui);
  const state = useGameState(transport);
  if (!s.marketOpen) return null;

  const player = state.players[state.localPlayerId]!;
  const close = () => ui.set({ marketOpen: false });

  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="market shop" role="dialog" aria-label="Market" onClick={(e) => e.stopPropagation()}>
        <div class="market-header">
          <h2>Market</h2>
          <button type="button" class="close-btn" aria-label="Close" onClick={close}>
            ✖
          </button>
        </div>
        {/* Its own row on PC so every tab is always visible (wrapping if it must);
            a vertical rail down the side of the sheet on phones. */}
        <div class="market-tabs" role="tablist" aria-label="Market sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={s.marketTab === t.id}
              class={`tab ${s.marketTab === t.id ? 'active' : ''}`}
              onClick={() => ui.set({ marketTab: t.id })}
            >
              <span class="tab-icon">{t.icon}</span>
              <span class="tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Keyed by tab so switching tabs starts at the top of the list. */}
        <div class="market-grid" key={s.marketTab}>
          {s.marketTab === 'seeds' && <SeedCards session={session} state={state} player={player} />}
          {(s.marketTab === 'trees' || s.marketTab === 'animals' || s.marketTab === 'buildings' || s.marketTab === 'decor') && (
            <ItemCards session={session} tab={s.marketTab} player={player} rules={state.rules} />
          )}
          {s.marketTab === 'supplies' && <SupplyCards session={session} player={player} rules={state.rules} />}
          {s.marketTab === 'vehicles' && <VehicleCards session={session} player={player} rules={state.rules} />}
          {s.marketTab === 'expand' && <ExpandCard session={session} state={state} player={player} />}
        </div>
        <p class="market-hint">Times shown are real time at the current game speed.</p>
      </div>
    </div>
  );
}

function SeedCards({ session, state, player }: { session: Session; state: GameState; player: PlayerState }) {
  const { ui, transport } = session;
  const content = transport.content;
  const rules = state.rules;
  const selected = useStore(ui).seedId;
  const crops = Object.values(content.crops).sort((a, b) => a.unlockLevel - b.unlockLevel || a.cost - b.cost);
  return (
    <>
      {crops.map((crop) => {
        const locked = player.level < crop.unlockLevel;
        const mastered = isMastered({ player }, crop.id);
        const cost = cropSeedCost(crop, rules, mastered ? content.base.mastery.seedDiscount : 0);
        const stars = player.masteryStars[crop.id] ?? 0;
        return (
          <button key={crop.id} type="button" class={`card ${selected === crop.id ? 'selected' : ''}`} disabled={locked} onClick={() => selectSeed(ui, crop.id)}>
            <span class="swatch" style={{ background: cropArt(crop.id).css }} />
            <span class="card-name">{crop.name}</span>
            {locked ? (
              <span class="card-lock">🔒 Level {crop.unlockLevel}</span>
            ) : (
              <>
                <span class="card-line">🪙 {formatNumber(cost)}{mastered && ' (mastered)'}</span>
                <span class="card-line">⏱ {formatDuration(cropGrowMs(crop, rules) / rules.timeScale)}</span>
                <span class="card-line">
                  Sells {formatNumber(cropHarvestCoins(crop, rules))} · +{trimXp(cropPlantXp(crop, rules))} XP
                </span>
                {stars > 0 && <span class="card-stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</span>}
              </>
            )}
          </button>
        );
      })}
    </>
  );
}

const KIND_FOR_TAB = { trees: 'tree', animals: 'animal', buildings: 'building', decor: 'decoration' } as const;

function ItemCards({ session, tab, player, rules }: { session: Session; tab: keyof typeof KIND_FOR_TAB; player: PlayerState; rules: WorldRules }) {
  const { ui, transport } = session;
  const content = transport.content;
  const kind = KIND_FOR_TAB[tab];
  const items = Object.values(content.placeables)
    .filter((i) => i.kind === kind && i.buyable)
    .sort((a, b) => a.unlockLevel - b.unlockLevel || a.cost - b.cost);
  return (
    <>
      {items.map((item) => {
        const locked = player.level < item.unlockLevel;
        return (
          <button key={item.id} type="button" class="card" disabled={locked} onClick={() => startPlacing(ui, item.id, 'market')}>
            <span class="swatch" style={{ background: itemArtCss(item.id) }} />
            <span class="card-name">{item.name}</span>
            {locked ? (
              <span class="card-lock">🔒 Level {item.unlockLevel}</span>
            ) : (
              <>
                <span class="card-line">🪙 {formatNumber(itemCost(item, rules))} · +{trimXp(itemXp(item, rules))} XP</span>
                <ItemDetails item={item} content={content} rules={rules} />
              </>
            )}
          </button>
        );
      })}
    </>
  );
}

function ItemDetails({ item, content, rules }: { item: PlaceableInfo; content: Content; rules: WorldRules }) {
  const real = (ms: number) => formatDuration(ms / rules.timeScale);
  if (item.kind === 'tree') {
    const t = content.trees[item.id]!;
    return <span class="card-line">Every {real(treeCycleMs(t, rules))} · {formatNumber(productionYield(t, rules))} coins</span>;
  }
  if (item.kind === 'animal') {
    const a = content.animals[item.id]!;
    return (
      <span class="card-line">
        {a.product} every {real(animalCycleMs(a, rules))} · {formatNumber(productionYield(a, rules))} coins
      </span>
    );
  }
  if (item.kind === 'building') {
    const b = content.buildings[item.id]!;
    const forTrees = b.houses.length > 0 && b.houses.every((id) => lookup(content.trees, id));
    const homes = forTrees ? 'fruit trees' : b.houses.map((id) => lookup(content.animals, id)?.name).filter(Boolean).join(', ');
    const what = homes ? `Holds ${b.capacity}: ${homes}` : b.fuelBonus ? `Fuel tank +${b.fuelBonus}` : `+${b.storage} storage`;
    const parts = b.construction ? Object.values(b.construction).reduce((a, n) => a + n, 0) : 0;
    return (
      <>
        <span class="card-line">
          {item.width}×{item.height} · {what}
        </span>
        {parts > 0 && <span class="card-line card-parts">🏗️ Built with {parts} parts</span>}
      </>
    );
  }
  return <span class="card-line">{item.width}×{item.height}</span>;
}

/** Consumables and building parts. They go to the gift box, so the market stays open for more. */
function SupplyCards({ session, player, rules }: { session: Session; player: PlayerState; rules: WorldRules }) {
  const { ui, transport } = session;
  const content = transport.content;
  const supplies = Object.values(content.supplies).sort((a, b) => (a.kind === 'part' ? 1 : 0) - (b.kind === 'part' ? 1 : 0) || a.unlockLevel - b.unlockLevel);
  const buy = (itemId: string, count: number) => {
    const result = transport.send({ type: 'buySupply', itemId, count });
    if (!result.ok) toast(ui, result.error.message, 'error');
  };
  return (
    <>
      {supplies.map((sup) => {
        const locked = player.level < sup.unlockLevel;
        const price = supplyPrice(sup, rules);
        const label = price.cash ? `💵 ${price.cash}` : `🪙 ${formatNumber(price.coins)}`;
        const owned = lookup(player.giftBox, sup.id) ?? 0;
        const afford = (n: number) => player.coins >= price.coins * n && player.cash >= price.cash * n;
        return (
          <div key={sup.id} class={`card supply-card ${locked ? 'is-locked' : ''}`}>
            <span class="swatch" style={{ background: itemArtCss(sup.id) }}>
              {itemIcon(sup.id)}
            </span>
            <span class="card-name">{sup.name}</span>
            {locked ? (
              <span class="card-lock">🔒 Level {sup.unlockLevel}</span>
            ) : (
              <>
                <span class="card-line">
                  {label}
                  {owned > 0 && <span class="muted"> · have {owned}</span>}
                </span>
                <span class="card-line muted">{sup.description}</span>
                <div class="card-actions">
                  <button type="button" class="btn btn-small btn-primary" disabled={!afford(1)} onClick={() => buy(sup.id, 1)}>
                    Buy
                  </button>
                  <button type="button" class="btn btn-small" disabled={!afford(5)} onClick={() => buy(sup.id, 5)}>
                    ×5
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

function VehicleCards({ session, player, rules }: { session: Session; player: PlayerState; rules: WorldRules }) {
  const { ui, transport } = session;
  const content = transport.content;
  const vehicles = Object.values(content.vehicles).sort((a, b) => a.unlockLevel - b.unlockLevel);
  const describe = (actions: readonly string[]) =>
    actions.length === 3 ? 'Harvests, plows and plants' : actions[0] === 'plow' ? 'Plows' : actions[0] === 'plant' ? 'Plants' : 'Harvests';
  return (
    <>
      {vehicles.map((v) => {
        const owned = player.vehicles.includes(v.id);
        const locked = player.level < v.unlockLevel;
        const buy = () => {
          const result = transport.send({ type: 'buyVehicle', vehicleId: v.id });
          if (!result.ok) toast(ui, result.error.message, 'error');
          else startVehicle(ui, v.id);
        };
        return (
          <button key={v.id} type="button" class={`card ${owned ? 'selected' : ''}`} disabled={locked && !owned} onClick={() => (owned ? startVehicle(ui, v.id) : buy())}>
            <span class="swatch" style={{ background: itemArtCss(v.id) }} />
            <span class="card-name">{v.name}</span>
            {locked && !owned ? (
              <span class="card-lock">🔒 Level {v.unlockLevel}</span>
            ) : (
              <>
                <span class="card-line">{owned ? '✅ Owned: tap to drive' : `🪙 ${formatNumber(vehicleCost(v, rules))}`}</span>
                <span class="card-line">
                  {describe(v.actions)} {v.area * v.area} plots · ⛽ {v.fuelPerUse}
                </span>
              </>
            )}
          </button>
        );
      })}
    </>
  );
}

function ExpandCard({ session, state, player }: { session: Session; state: GameState; player: PlayerState }) {
  const { ui, transport } = session;
  const farm = state.farms[state.homeFarmId]!;
  const next = nextExpansion(transport.content, farm.width);
  if (!next) return <p class="market-empty">Your farm is as big as it gets ({farm.width}×{farm.height}).</p>;
  const cost = expansionCost(next, state.rules);
  const locked = player.level < next.unlockLevel;
  const expand = () => {
    const result = transport.send({ type: 'expandFarm' });
    if (!result.ok) toast(ui, result.error.message, 'error');
    else ui.set({ marketOpen: false });
  };
  return (
    <div class="expand-card">
      <div class="card-name">
        {farm.width}×{farm.height} → {next.size}×{next.size}
      </div>
      <p>{next.size * next.size - farm.width * farm.height} more plots of land.</p>
      {locked ? (
        <span class="card-lock">🔒 Level {next.unlockLevel}</span>
      ) : (
        <button type="button" class="btn btn-primary" disabled={player.coins < cost} onClick={expand}>
          Expand for 🪙 {formatNumber(cost)}
        </button>
      )}
    </div>
  );
}

function trimXp(xp: number): string {
  return Number.isInteger(xp) ? String(xp) : xp.toFixed(1);
}
