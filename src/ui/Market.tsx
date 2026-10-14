import type { Session } from '../app/session';
import { selectSeed, startPlacing } from '../app/uiState';
import type { MarketTab } from '../app/uiState';
import { cropGrowMs, cropHarvestCoins, cropPlantXp, cropSeedCost, decorationCost, decorationXp } from '../core';
import { cropArt, decorationArt } from '../game/art/artData';
import { formatDuration, formatNumber } from './format';
import { useGameState, useStore } from './hooks';

const TABS: { id: MarketTab; label: string }[] = [
  { id: 'seeds', label: '🌱 Seeds' },
  { id: 'decor', label: '🌼 Decorations' },
];

export function Market({ session }: { session: Session }) {
  const { ui, transport } = session;
  const s = useStore(ui);
  const state = useGameState(transport);
  if (!s.marketOpen) return null;

  const content = transport.content;
  const player = state.players[state.localPlayerId]!;
  const rules = state.rules;
  const close = () => ui.set({ marketOpen: false });

  const crops = Object.values(content.crops).sort((a, b) => a.unlockLevel - b.unlockLevel || a.cost - b.cost);
  const decorations = Object.values(content.decorations).sort((a, b) => a.unlockLevel - b.unlockLevel || a.cost - b.cost);

  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="market" role="dialog" aria-label="Market" onClick={(e) => e.stopPropagation()}>
        <div class="market-header">
          <h2>Market</h2>
          <div class="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={s.marketTab === t.id}
                class={`tab ${s.marketTab === t.id ? 'active' : ''}`}
                onClick={() => ui.set({ marketTab: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" class="close-btn" aria-label="Close" onClick={close}>
            ✖
          </button>
        </div>

        <div class="market-grid">
          {s.marketTab === 'seeds' &&
            crops.map((crop) => {
              const locked = player.level < crop.unlockLevel;
              const cost = cropSeedCost(crop, rules);
              const growReal = cropGrowMs(crop, rules) / rules.timeScale;
              return (
                <button
                  key={crop.id}
                  type="button"
                  class={`card ${s.seedId === crop.id ? 'selected' : ''}`}
                  disabled={locked}
                  onClick={() => selectSeed(ui, crop.id)}
                >
                  <span class="swatch" style={{ background: cropArt(crop.id).css }} />
                  <span class="card-name">{crop.name}</span>
                  {locked ? (
                    <span class="card-lock">🔒 Level {crop.unlockLevel}</span>
                  ) : (
                    <>
                      <span class="card-line">🪙 {formatNumber(cost)}</span>
                      <span class="card-line">⏱ {formatDuration(growReal)}</span>
                      <span class="card-line">
                        Sells {formatNumber(cropHarvestCoins(crop, rules))} · +{trimXp(cropPlantXp(crop, rules))} XP
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          {s.marketTab === 'decor' &&
            decorations.map((item) => {
              const locked = player.level < item.unlockLevel;
              return (
                <button key={item.id} type="button" class="card" disabled={locked} onClick={() => startPlacing(ui, item.id)}>
                  <span class="swatch" style={{ background: decorationArt(item.id).css }} />
                  <span class="card-name">{item.name}</span>
                  {locked ? (
                    <span class="card-lock">🔒 Level {item.unlockLevel}</span>
                  ) : (
                    <>
                      <span class="card-line">🪙 {formatNumber(decorationCost(item, rules))}</span>
                      <span class="card-line">
                        {item.width}×{item.height} · +{trimXp(decorationXp(item, rules))} XP
                      </span>
                    </>
                  )}
                </button>
              );
            })}
        </div>
        <p class="market-hint">Times shown are real time at the current game speed.</p>
      </div>
    </div>
  );
}

function trimXp(xp: number): string {
  return Number.isInteger(xp) ? String(xp) : xp.toFixed(1);
}
