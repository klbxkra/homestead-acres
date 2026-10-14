import type { Session } from '../app/session';
import { cancelTool, PAINT_TOOLS, selectTool } from '../app/uiState';
import type { ToolId } from '../app/uiState';
import { lookup } from '../core';
import { useStore } from './hooks';

interface ToolButton {
  id: ToolId;
  icon: string;
  label: string;
  hotkey: string;
}

const TOOLS: ToolButton[] = [
  { id: 'multi', icon: '✋', label: 'Multi-tool', hotkey: '1' },
  { id: 'plow', icon: '⛏️', label: 'Plow', hotkey: '2' },
  { id: 'seed', icon: '🌱', label: 'Seeds', hotkey: '3' },
  { id: 'harvest', icon: '🧺', label: 'Harvest', hotkey: '4' },
  { id: 'move', icon: '✥', label: 'Move', hotkey: '5' },
  { id: 'sell', icon: '💲', label: 'Sell / remove', hotkey: '6' },
];

export function Toolbar({ session }: { session: Session }) {
  const { ui, transport } = session;
  const s = useStore(ui);
  const content = transport.content;
  const seedName = s.seedId ? lookup(content.crops, s.seedId)?.name : null;
  const placeName = s.placeItemId ? lookup(content.decorations, s.placeItemId)?.name : null;
  const holding = (s.tool === 'place' && s.placeItemId) || (s.tool === 'move' && s.movingEntityId);

  const pick = (tool: ToolId) => {
    if (tool === 'seed' && !s.seedId) ui.set({ marketOpen: true, marketTab: 'seeds' });
    else selectTool(ui, tool);
  };

  return (
    <div class="toolbar interactive" role="toolbar" aria-label="Tools">
      {(seedName || placeName || s.tool === 'move') && (
        <div class="tool-status">
          {s.tool === 'place' && placeName && <>Placing <b>{placeName}</b></>}
          {s.tool === 'move' && (s.movingEntityId ? 'Tap where it should go' : 'Tap something to move')}
          {s.tool !== 'place' && s.tool !== 'move' && seedName && <>Seed: <b>{seedName}</b></>}
        </div>
      )}
      <div class="tool-row">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            class={`tool-btn ${s.tool === t.id ? 'active' : ''}`}
            title={`${t.label} (${t.hotkey})`}
            aria-pressed={s.tool === t.id}
            onClick={() => pick(t.id)}
          >
            <span class="tool-icon">{t.icon}</span>
          </button>
        ))}
        <button
          type="button"
          class={`tool-btn ${s.paint ? 'active' : ''}`}
          title="Paint mode: drag across plots to use the tool on each one (P)"
          aria-pressed={s.paint}
          disabled={!PAINT_TOOLS.includes(s.tool)}
          onClick={() => ui.set({ paint: !s.paint })}
        >
          <span class="tool-icon">🖌️</span>
        </button>
        {holding && (
          <button type="button" class="tool-btn" title="Rotate (R)" onClick={() => ui.set({ rotated: !s.rotated })}>
            <span class="tool-icon">🔄</span>
          </button>
        )}
        {s.tool !== 'multi' && (
          <button type="button" class="tool-btn" title="Cancel (Esc)" onClick={() => cancelTool(ui)}>
            <span class="tool-icon">✖</span>
          </button>
        )}
        <button
          type="button"
          class="tool-btn market-btn"
          title="Market (M)"
          onClick={() => ui.set({ marketOpen: true })}
        >
          <span class="tool-icon">🏪</span>
        </button>
      </div>
    </div>
  );
}
