import { useEffect, useState } from 'preact/hooks';
import { formatAgo } from '../app/GameApp';
import type { GameApp } from '../app/GameApp';
import { useStore } from './hooks';

/** HUD menu button + dropdown: save status, save now, export, exit to the farm list. */
export function GameMenu({ gameApp }: { gameApp: GameApp }) {
  const app = useStore(gameApp.store);
  const [, setNow] = useState(Date.now());

  // Keep "saved 20 seconds ago" fresh while the menu is open.
  useEffect(() => {
    if (!app.menuOpen) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [app.menuOpen]);

  const status =
    app.saveStatus === 'saving'
      ? 'Saving…'
      : app.saveStatus === 'error'
        ? '⚠️ Last save failed'
        : app.lastSavedAt
          ? `Saved ${formatAgo(Date.now() - app.lastSavedAt)}`
          : 'Not saved yet';

  return (
    <div class="game-menu interactive">
      <button
        type="button"
        class="hud-chip menu-btn"
        aria-label="Menu"
        aria-expanded={app.menuOpen}
        onClick={() => gameApp.setMenuOpen(!app.menuOpen)}
      >
        ☰
      </button>
      {app.menuOpen && (
        <>
          <div class="menu-scrim" onClick={() => gameApp.setMenuOpen(false)} />
          <div class="menu-panel" role="menu">
            <div class={`menu-status ${app.saveStatus === 'error' ? 'error' : ''}`}>{status}</div>
            <button type="button" class="menu-item" role="menuitem" onClick={() => void gameApp.saveNow()}>
              💾 Save now
            </button>
            <button
              type="button"
              class="menu-item"
              role="menuitem"
              onClick={() => {
                gameApp.setMenuOpen(false);
                if (app.slotId) void gameApp.exportSlot(app.slotId);
              }}
            >
              📤 Export farm to file
            </button>
            <button type="button" class="menu-item" role="menuitem" disabled={app.busy} onClick={() => void gameApp.exitToTitle()}>
              🏠 Save &amp; exit to farms
            </button>
          </div>
        </>
      )}
    </div>
  );
}
