import { useEffect, useRef, useState } from 'preact/hooks';
import { formatAgo } from '../app/GameApp';
import type { GameApp } from '../app/GameApp';
import { defaultPresetFromQuery } from '../app/session';
import { GAME_TITLE } from '../config';
import { PRESET_IDS } from '../core';
import type { PresetId } from '../core';
import type { SlotMeta } from '../persistence';
import { readTextFile } from '../platform/files';
import { formatDuration, formatNumber } from './format';
import { useStore } from './hooks';

const PRESET_INFO: Record<PresetId, { name: string; blurb: string }> = {
  classic: { name: 'Classic', blurb: 'The original pace. Crops wither if you leave them too long.' },
  relaxed: { name: 'Relaxed', blurb: 'No withering and double coins from harvests.' },
  idle: { name: 'Idle', blurb: 'No withering, faster crops, and timers pause while the game is closed.' },
  speedrun: { name: 'Speed run', blurb: 'Time runs 600× faster with 5× XP. Good for trying things out.' },
};

export function TitleScreen({ gameApp }: { gameApp: GameApp }) {
  const app = useStore(gameApp.store);
  const [creating, setCreating] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [, setClock] = useState(0);

  // Keep "saved 5 minutes ago" current while the list is open.
  useEffect(() => {
    const t = setInterval(() => setClock((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const showForm = creating || (app.screen === 'title' && app.slots.length === 0);

  const onImport = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow importing the same file again
    if (!file) return;
    try {
      await gameApp.importText(await readTextFile(file));
    } catch (err) {
      gameApp.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div class="title-screen interactive">
      <div class="title-inner">
        <header class="title-header">
          <h1>{GAME_TITLE}</h1>
          <p>Plow, plant and harvest your way to the best farm in the county.</p>
        </header>

        {app.storageWarning && <div class="banner banner-warn">{app.storageWarning}</div>}

        {app.screen === 'loading' ? (
          <p class="title-loading">Loading your farms…</p>
        ) : showForm ? (
          <NewFarmForm
            gameApp={gameApp}
            busy={app.busy}
            canCancel={app.slots.length > 0}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <>
            <div class="slot-list">
              {app.slots.map((slot) => (
                <SlotCard key={slot.slotId} slot={slot} gameApp={gameApp} busy={app.busy} />
              ))}
            </div>
            <div class="title-actions">
              <button type="button" class="btn btn-primary" disabled={app.busy} onClick={() => setCreating(true)}>
                🌱 New farm
              </button>
              <button type="button" class="btn" disabled={app.busy} onClick={() => fileInput.current?.click()}>
                📂 Import farm
              </button>
            </div>
          </>
        )}
        {showForm && (
          <p class="title-hint">
            Have a farm from another device?{' '}
            <button type="button" class="link-btn" onClick={() => fileInput.current?.click()}>
              Import a .farm file
            </button>
          </p>
        )}
        <input ref={fileInput} type="file" accept=".farm,.json,application/json" hidden onChange={onImport} />
      </div>
    </div>
  );
}

function SlotCard({ slot, gameApp, busy }: { slot: SlotMeta; gameApp: GameApp; busy: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div class="slot-card">
      <div class="slot-info">
        <div class="slot-name">{slot.farmName}</div>
        <div class="slot-line">
          {slot.playerName} · Level {slot.level} · 🪙 {formatNumber(slot.coins)}
        </div>
        <div class="slot-line muted">
          Saved {formatAgo(Date.now() - slot.lastSavedAt)}
          {slot.playtimeMs >= 60_000 && <> · played {formatDuration(slot.playtimeMs)}</>}
        </div>
      </div>
      {confirmDelete ? (
        <div class="slot-buttons">
          <span class="slot-confirm">Delete forever?</span>
          <button type="button" class="btn" onClick={() => setConfirmDelete(false)}>
            Keep
          </button>
          <button type="button" class="btn btn-danger" disabled={busy} onClick={() => void gameApp.deleteSlot(slot.slotId)}>
            Delete
          </button>
        </div>
      ) : (
        <div class="slot-buttons">
          <button type="button" class="btn btn-primary" disabled={busy} onClick={() => void gameApp.openSlot(slot.slotId)}>
            Play
          </button>
          <button type="button" class="btn icon-btn" title="Export to a file" disabled={busy} onClick={() => void gameApp.exportSlot(slot.slotId)}>
            💾
          </button>
          <button type="button" class="btn icon-btn" title="Delete" disabled={busy} onClick={() => setConfirmDelete(true)}>
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}

function NewFarmForm({ gameApp, busy, canCancel, onCancel }: { gameApp: GameApp; busy: boolean; canCancel: boolean; onCancel: () => void }) {
  const [farmName, setFarmName] = useState('Sunny Acres');
  const [playerName, setPlayerName] = useState('Farmer');
  const [preset, setPreset] = useState<PresetId>(defaultPresetFromQuery);

  const submit = (e: Event) => {
    e.preventDefault();
    void gameApp.newFarm({ farmName, playerName, preset });
  };

  return (
    <form class="new-farm" onSubmit={submit}>
      <h2>Start a new farm</h2>
      <div class="field-row">
        <label class="field">
          <span>Farm name</span>
          <input value={farmName} maxLength={40} onInput={(e) => setFarmName(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Your name</span>
          <input value={playerName} maxLength={30} onInput={(e) => setPlayerName(e.currentTarget.value)} />
        </label>
      </div>
      <fieldset class="presets">
        <legend>Game rules (you can fine-tune these later)</legend>
        {PRESET_IDS.map((id) => (
          <label key={id} class={`preset ${preset === id ? 'selected' : ''}`}>
            <input type="radio" name="preset" value={id} checked={preset === id} onChange={() => setPreset(id)} />
            <span class="preset-name">{PRESET_INFO[id].name}</span>
            <span class="preset-blurb">{PRESET_INFO[id].blurb}</span>
          </label>
        ))}
      </fieldset>
      <div class="title-actions">
        {canCancel && (
          <button type="button" class="btn" onClick={onCancel}>
            Back
          </button>
        )}
        <button type="submit" class="btn btn-primary" disabled={busy}>
          Start farming
        </button>
      </div>
    </form>
  );
}
