import { useState } from 'preact/hooks';
import type { Session } from '../app/session';
import { startPlacing, toast } from '../app/uiState';
import { itemRefund, lookup, storageCapacity, storedCount } from '../core';
import type { InventorySource } from '../core';
import { itemArtCss } from '../game/art/artData';
import { formatNumber } from './format';
import { useGameState, useStore } from './hooks';

/** Gift box (rewards, unlimited) and storage (things put away, limited). */
export function InventoryPanel({ session }: { session: Session }) {
  const { ui, transport } = session;
  const s = useStore(ui);
  const state = useGameState(transport);
  const [tab, setTab] = useState<InventorySource>('giftBox');
  if (s.panel !== 'inventory') return null;

  const content = transport.content;
  const player = state.players[state.localPlayerId]!;
  const farm = state.farms[state.homeFarmId]!;
  const items = Object.entries(tab === 'giftBox' ? player.giftBox : player.storage).filter(([, n]) => n > 0);
  const close = () => ui.set({ panel: null });

  const sell = (itemId: string) => {
    const result = transport.send({ type: 'sellItem', itemId, from: tab });
    if (!result.ok) toast(ui, result.error.message, 'error');
  };

  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="market" role="dialog" aria-label="Inventory" onClick={(e) => e.stopPropagation()}>
        <div class="market-header">
          <h2>Inventory</h2>
          <div class="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'giftBox'} class={`tab ${tab === 'giftBox' ? 'active' : ''}`} onClick={() => setTab('giftBox')}>
              🎁 Gift box ({count(player.giftBox)})
            </button>
            <button type="button" role="tab" aria-selected={tab === 'storage'} class={`tab ${tab === 'storage' ? 'active' : ''}`} onClick={() => setTab('storage')}>
              📦 Storage ({storedCount(player)}/{storageCapacity(farm, content)})
            </button>
          </div>
          <button type="button" class="close-btn" aria-label="Close" onClick={close}>
            ✖
          </button>
        </div>
        <div class="market-grid">
          {items.length === 0 && (
            <p class="market-empty">
              {tab === 'giftBox'
                ? 'Rewards from mastery, collections and ribbons arrive here.'
                : 'Use the 📦 store tool on anything on your farm to put it away here.'}
            </p>
          )}
          {items.map(([itemId, n]) => {
            const item = lookup(content.placeables, itemId);
            const refund = item ? itemRefund(item, content, state.rules) : 0;
            return (
              <div key={itemId} class="card inventory-card">
                <span class="swatch" style={{ background: itemArtCss(itemId) }} />
                <span class="card-name">
                  {item?.name ?? itemId} {n > 1 && <span class="badge">×{n}</span>}
                </span>
                <div class="card-actions">
                  <button type="button" class="btn btn-small btn-primary" disabled={!item} onClick={() => startPlacing(ui, itemId, tab)}>
                    Place
                  </button>
                  <button type="button" class="btn btn-small" onClick={() => sell(itemId)} title={refund ? `Sell for ${refund} coins` : 'Discard'}>
                    {refund ? `Sell ${formatNumber(refund)}` : 'Discard'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function count(inv: Record<string, number>): number {
  return Object.values(inv).reduce((a, b) => a + b, 0);
}
