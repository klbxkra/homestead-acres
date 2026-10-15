import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Session } from '../app/session';
import { cancelTool, PAINT_TOOLS, selectTool, startVehicle } from '../app/uiState';
import type { ToolId } from '../app/uiState';
import { lookup } from '../core';
import { cropArt } from '../game/art/artData';
import { useGameState, useStore } from './hooks';

interface ToolDef {
  id: ToolId;
  icon: string;
  /** Short caption under the icon (PC). */
  label: string;
  /** Full name for the tooltip. */
  title: string;
  hotkey: string;
}

/** Everyday farming tools, always one tap away. */
const FARM_TOOLS: ToolDef[] = [
  { id: 'multi', icon: '✋', label: 'Multi', title: 'Multi-tool', hotkey: '1' },
  { id: 'plow', icon: '⛏️', label: 'Plow', title: 'Plow', hotkey: '2' },
  { id: 'seed', icon: '🌱', label: 'Seeds', title: 'Seeds', hotkey: '3' },
  { id: 'harvest', icon: '🧺', label: 'Harvest', title: 'Harvest', hotkey: '4' },
];

/** Rearranging the farm: tucked behind one Edit button. */
const EDIT_TOOLS: ToolDef[] = [
  { id: 'move', icon: '✥', label: 'Move', title: 'Move', hotkey: '5' },
  { id: 'sell', icon: '💲', label: 'Sell', title: 'Sell / remove', hotkey: '6' },
  { id: 'store', icon: '📦', label: 'Store', title: 'Put in storage', hotkey: '7' },
];

export function Toolbar({ session }: { session: Session }) {
  const { ui, transport } = session;
  const s = useStore(ui);
  const state = useGameState(transport);
  const player = state.players[state.localPlayerId]!;
  const content = transport.content;
  const seedName = s.seedId ? lookup(content.crops, s.seedId)?.name : null;
  const placeName = s.placeItemId ? lookup(content.placeables, s.placeItemId)?.name : null;
  const vehicleName = s.vehicleId ? lookup(content.vehicles, s.vehicleId)?.name : null;
  const holding = (s.tool === 'place' && s.placeItemId) || (s.tool === 'move' && s.movingEntityId);
  const gifts = Object.values(player.giftBox).reduce((a, b) => a + b, 0);
  const editTool = EDIT_TOOLS.find((t) => t.id === s.tool);

  const [editOpen, setEditOpen] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editOpen) return;
    const onDown = (e: PointerEvent) => {
      if (editRef.current?.contains(e.target as Node)) return;
      setEditOpen(false);
      // A tap on the farm just closes the menu; it shouldn't also plow or harvest something.
      if (e.target instanceof HTMLCanvasElement) e.stopPropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [editOpen]);

  const pick = (tool: ToolId) => {
    setEditOpen(false);
    if (tool === 'seed' && !s.seedId) ui.set({ marketOpen: true, marketTab: 'seeds' });
    else selectTool(ui, tool);
  };

  /** One vehicle: drive it. Several: cycle through them; the market lists them all. */
  const vehicleButton = () => {
    const owned = player.vehicles;
    if (owned.length === 0) return ui.set({ marketOpen: true, marketTab: 'vehicles' });
    const i = s.tool === 'vehicle' && s.vehicleId ? owned.indexOf(s.vehicleId) : -1;
    startVehicle(ui, owned[(i + 1) % owned.length]!);
  };

  const status =
    s.tool === 'place' && placeName ? (
      <>
        Placing <b>{placeName}</b>
        {s.placeFrom !== 'market' && ` from ${s.placeFrom === 'giftBox' ? 'gift box' : 'storage'}`}
      </>
    ) : s.tool === 'move' ? (
      s.movingEntityId ? 'Tap where it should go' : 'Tap something to move'
    ) : s.tool === 'sell' ? (
      'Tap something to sell it'
    ) : s.tool === 'store' ? (
      'Tap something to put it in storage'
    ) : s.tool === 'vehicle' && vehicleName ? (
      <>
        Driving <b>{vehicleName}</b>
        {seedName && (
          <>
            {' '}
            · <b>{seedName}</b>
          </>
        )}
      </>
    ) : seedName ? (
      <>
        Seed: <b>{seedName}</b>
      </>
    ) : null;

  const showPaint = PAINT_TOOLS.includes(s.tool);
  const showContext = showPaint || holding || s.tool !== 'multi';

  return (
    <div class="toolbar interactive" role="toolbar" aria-label="Tools">
      {status && <div class="tool-status">{status}</div>}
      <div class="tool-dock">
        {/* Buttons that come and go with the current tool live in their own group, so
            the everyday buttons never shift under your finger or cursor. */}
        {showContext && (
          <div class="tool-group tool-group-context">
            {showPaint && (
              <ToolBtn
                icon="🖌️"
                label="Paint"
                title="Paint mode: drag across plots to use the tool on each one (P)"
                active={s.paint}
                pressed={s.paint}
                onClick={() => ui.set({ paint: !s.paint })}
              />
            )}
            {holding && <ToolBtn icon="🔄" label="Rotate" title="Rotate (R)" onClick={() => ui.set({ rotated: !s.rotated })} />}
            {s.tool !== 'multi' && <ToolBtn icon="✖" label="Cancel" title="Cancel (Esc)" onClick={() => cancelTool(ui)} />}
          </div>
        )}

        <div class="tool-group tool-group-farm">
          {FARM_TOOLS.map((t) => (
            <ToolBtn
              key={t.id}
              icon={t.icon}
              label={t.label}
              title={`${t.title} (${t.hotkey})`}
              active={s.tool === t.id}
              pressed={s.tool === t.id}
              onClick={() => pick(t.id)}
            >
              {t.id === 'seed' && s.seedId && <span class="tool-seed-dot" style={{ background: cropArt(s.seedId).css }} />}
            </ToolBtn>
          ))}
          <div class="tool-edit" ref={editRef}>
            <ToolBtn
              icon={editTool?.icon ?? '🛠️'}
              label={editTool?.label ?? 'Edit'}
              title="Edit your farm: move, sell or store things (5, 6, 7)"
              active={!!editTool}
              expanded={editOpen}
              onClick={() => setEditOpen((o) => !o)}
            >
              <span class="tool-caret" aria-hidden="true">
                ▴
              </span>
            </ToolBtn>
            {editOpen && (
              <div class="tool-flyout" role="menu" aria-label="Edit tools">
                {EDIT_TOOLS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={s.tool === t.id}
                    class={`flyout-item ${s.tool === t.id ? 'active' : ''}`}
                    onClick={() => pick(t.id)}
                  >
                    <span class="tool-icon">{t.icon}</span>
                    <span class="flyout-label">{t.title}</span>
                    <kbd>{t.hotkey}</kbd>
                  </button>
                ))}
              </div>
            )}
          </div>
          {player.vehicles.length > 0 && (
            <ToolBtn
              icon="🚜"
              label={s.tool === 'vehicle' && vehicleName ? vehicleName : 'Drive'}
              title="Drive a vehicle; tap again for the next one (8)"
              active={s.tool === 'vehicle'}
              pressed={s.tool === 'vehicle'}
              onClick={vehicleButton}
            />
          )}
        </div>

        <div class="tool-group tool-group-panels">
          <ToolBtn icon="🎁" label="Gifts" title="Gift box & storage (I)" onClick={() => ui.set({ panel: 'inventory' })}>
            {gifts > 0 && <span class="tool-badge">{gifts > 99 ? '99+' : gifts}</span>}
          </ToolBtn>
          <ToolBtn icon="📖" label="Book" title="Farmer's Book: mastery, ribbons, collections (B)" onClick={() => ui.set({ panel: 'book' })} />
          <ToolBtn icon="🏪" label="Market" title="Market (M)" extraClass="market-btn" onClick={() => ui.set({ marketOpen: true })} />
        </div>
      </div>
    </div>
  );
}

interface ToolBtnProps {
  icon: string;
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  /** For toggle buttons: exposes the on/off state to screen readers. */
  pressed?: boolean;
  /** For buttons that open a menu. */
  expanded?: boolean;
  extraClass?: string;
  children?: ComponentChildren;
}

function ToolBtn({ icon, label, title, onClick, active = false, pressed, expanded, extraClass = '', children }: ToolBtnProps) {
  return (
    <button
      type="button"
      class={`tool-btn ${active ? 'active' : ''} ${extraClass}`}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      onClick={onClick}
    >
      <span class="tool-icon">{icon}</span>
      <span class="tool-label">{label}</span>
      {children}
    </button>
  );
}
