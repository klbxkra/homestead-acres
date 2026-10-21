/** Parts dialog for a construction building that is still a frame (PLAN.md section 4.5). */
import type { Session } from '../app/session';
import { toast } from '../app/uiState';
import { lookup, missingParts, supplyPrice } from '../core';
import { formatNumber } from './format';
import { useGameState, useStore } from './hooks';

export function ConstructionDialog({ session }: { session: Session }) {
  const { ui, transport } = session;
  const s = useStore(ui);
  const state = useGameState(transport);
  if (!s.constructionId) return null;
  const content = transport.content;
  const farm = state.farms[state.homeFarmId]!;
  const entity = lookup(farm.entities, s.constructionId);
  const close = () => ui.set({ constructionId: null });
  if (entity?.kind !== 'building' || !entity.parts) return null;
  const def = lookup(content.buildings, entity.itemId);
  const player = state.players[state.localPlayerId]!;
  const missing = missingParts({ content }, entity) ?? {};
  const need = Object.entries(def?.construction ?? {});

  // Parts still to buy after using what's in the gift box.
  const toBuy = Object.entries(missing)
    .map(([part, n]) => [part, Math.max(0, n - (lookup(player.giftBox, part) ?? 0))] as const)
    .filter(([, n]) => n > 0);
  const buyCost = toBuy.reduce((sum, [part, n]) => {
    const p = lookup(content.supplies, part);
    return sum + (p ? supplyPrice(p, state.rules).coins * n : 0);
  }, 0);
  const canAdd = Object.keys(missing).some((part) => (lookup(player.giftBox, part) ?? 0) > 0);

  const addParts = () => {
    const result = transport.send({ type: 'addParts', entityId: entity.id });
    if (!result.ok) toast(ui, result.error.message, 'error');
    else if (result.events.some((e) => e.type === 'constructionCompleted')) close();
  };
  const buyAndBuild = () => {
    for (const [part, n] of toBuy) {
      const result = transport.send({ type: 'buySupply', itemId: part, count: n });
      if (!result.ok) return toast(ui, result.error.message, 'error');
    }
    addParts();
  };

  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="dialog construction" role="dialog" aria-label="Construction" onClick={(e) => e.stopPropagation()}>
        <h2>🏗️ {def?.name ?? 'Building'} (under construction)</h2>
        <p class="muted">Add building parts to finish it. Neighbors send parts as gifts, or you can buy them.</p>
        <div class="parts-list">
          {need.map(([part, total]) => {
            const have = entity.parts![part] ?? 0;
            const inBox = lookup(player.giftBox, part) ?? 0;
            return (
              <div key={part} class="goal-row">
                <span class="goal-name stacked">
                  {lookup(content.supplies, part)?.name ?? part}
                  {have < total && inBox > 0 && <small class="muted"> {inBox} in gift box</small>}
                </span>
                <span class="bar">
                  <span class="bar-fill" style={{ width: `${(have / total) * 100}%` }} />
                </span>
                <span class="goal-count">
                  {have} / {total}
                </span>
              </div>
            );
          })}
        </div>
        <div class="dialog-buttons">
          <button type="button" class="btn" onClick={close}>
            Close
          </button>
          <button type="button" class="btn" disabled={!canAdd} onClick={addParts}>
            Add parts from gift box
          </button>
          {toBuy.length > 0 && (
            <button type="button" class="btn btn-primary" disabled={player.coins < buyCost} onClick={buyAndBuild}>
              Buy the rest: 🪙 {formatNumber(buyCost)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
