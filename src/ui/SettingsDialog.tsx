import { useEffect, useState } from 'preact/hooks';
import type { GameApp, SettingsTab } from '../app/GameApp';
import { UI_SCALES, VOLUMES } from '../app/settings';
import type { DeviceSettings, UiScale, Volume } from '../app/settings';
import type { WorldRules } from '../core';
import { useGameState, useStore } from './hooks';
import { RulesEditor, Segmented } from './RulesEditor';

const SCALE_LABELS: Record<UiScale, string> = { 0.85: 'Small', 1: 'Normal', 1.15: 'Large', 1.3: 'Huge' };
const VOLUME_LABELS: Record<Volume, string> = { 0: 'Off', 0.25: 'Low', 0.5: 'Medium', 1: 'High' };
const VOLUME_OPTIONS = VOLUMES.map((v) => [v, VOLUME_LABELS[v]] as const);

export function SettingsDialog({ gameApp }: { gameApp: GameApp }) {
  const { settingsOpen } = useStore(gameApp.store);
  if (!settingsOpen) return null;
  return <SettingsPanel gameApp={gameApp} tab={settingsOpen} />;
}

function SettingsPanel({ gameApp, tab }: { gameApp: GameApp; tab: SettingsTab }) {
  const hasFarm = gameApp.session !== null && gameApp.store.get().screen === 'farm';
  const close = () => gameApp.closeSettings();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="settings" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div class="market-header">
          <h2>Settings</h2>
          <div class="tabs" role="tablist">
            {hasFarm && (
              <button type="button" role="tab" aria-selected={tab === 'rules'} class={`tab ${tab === 'rules' ? 'active' : ''}`} onClick={() => gameApp.openSettings('rules')}>
                🌾 World rules
              </button>
            )}
            <button type="button" role="tab" aria-selected={tab === 'game'} class={`tab ${tab === 'game' ? 'active' : ''}`} onClick={() => gameApp.openSettings('game')}>
              🎮 Game
            </button>
          </div>
          <button type="button" class="close-btn" aria-label="Close" onClick={close}>
            ✖
          </button>
        </div>
        <div class="settings-body">{tab === 'rules' && hasFarm ? <FarmRules gameApp={gameApp} /> : <GameSettings gameApp={gameApp} />}</div>
      </div>
    </div>
  );
}

/** Edits a draft of the open farm's rules; nothing changes until Apply. */
function FarmRules({ gameApp }: { gameApp: GameApp }) {
  const session = gameApp.session!;
  const state = useGameState(session.transport);
  const [draft, setDraft] = useState<WorldRules>(() => structuredClone(state.rules));
  const changed = JSON.stringify(draft) !== JSON.stringify(state.rules);

  const apply = () => {
    const result = gameApp.applyRules(draft);
    if (result.ok) gameApp.closeSettings();
  };

  return (
    <>
      <p class="settings-intro">
        These rules belong to <b>{state.farms[state.homeFarmId]!.name}</b> and are saved with it. Changes to grow times apply to
        crops planted from now on; everything else applies straight away.
      </p>
      <RulesEditor rules={draft} onChange={setDraft} mode="farm" content={session.transport.content} onError={(m) => gameApp.notify(m, 'error')} />
      <div class="settings-footer">
        <button type="button" class="btn" disabled={!changed} onClick={() => setDraft(structuredClone(state.rules))}>
          Undo changes
        </button>
        <button type="button" class="btn btn-primary" disabled={!changed} onClick={apply}>
          Apply rules
        </button>
      </div>
    </>
  );
}

/** Per-device preferences; saved as soon as they change. */
function GameSettings({ gameApp }: { gameApp: GameApp }) {
  const settings = useStore(gameApp.settings);
  const set = (patch: Partial<DeviceSettings>) => gameApp.settings.set(patch);

  return (
    <div class="rules-editor">
      <p class="settings-intro">These settings are for this device only and apply to every farm.</p>
      <section>
        <div class="rule-row">
          <div class="rule-label">
            <span>Interface size</span>
            <small>Size of the toolbar, top bar and menus.</small>
          </div>
          <Segmented<UiScale> value={settings.uiScale} options={UI_SCALES.map((s) => [s, SCALE_LABELS[s]] as const)} onChange={(uiScale) => set({ uiScale })} />
        </div>
        <SettingToggle label="Coin and XP pop-ups" hint="Numbers that float up when you plant, harvest or buy." checked={settings.floatingNumbers} onChange={(floatingNumbers) => set({ floatingNumbers })} />
        <SettingToggle label="Ask before selling" hint="Confirm before selling decorations or removing growing crops." checked={settings.confirmSell} onChange={(confirmSell) => set({ confirmSell })} />
        <SettingToggle label="Info on hover" hint="With a mouse, show crop timers when hovering over a plot." checked={settings.hoverTooltips} onChange={(hoverTooltips) => set({ hoverTooltips })} />
        <SettingToggle label="Vibration" hint="A short buzz on touch actions, on phones that support it." checked={settings.haptics} onChange={(haptics) => set({ haptics })} />
      </section>

      <section>
        <h3>Sound</h3>
        <div class="rule-row">
          <div class="rule-label">
            <span>Sound effects</span>
            <small>Plowing, harvesting, coins and level-ups.</small>
          </div>
          <Segmented<Volume> value={settings.sfxVolume} options={VOLUME_OPTIONS} onChange={(sfxVolume) => set({ sfxVolume })} />
        </div>
        <div class="rule-row">
          <div class="rule-label">
            <span>Music</span>
            <small>A gentle tune while you farm.</small>
          </div>
          <Segmented<Volume> value={settings.musicVolume} options={VOLUME_OPTIONS} onChange={(musicVolume) => set({ musicVolume })} />
        </div>
      </section>

      <section>
        <h3>Farming</h3>
        <SettingToggle
          label="Instant actions"
          hint="Plow, plant and harvest at once instead of your farmer walking to each job."
          checked={settings.instantActions}
          onChange={(instantActions) => set({ instantActions })}
        />
        <SettingToggle
          label="Battery saver"
          hint="30 frames a second and fewer animations, for older phones and longer battery life."
          checked={settings.batterySaver}
          onChange={(batterySaver) => set({ batterySaver })}
        />
        {gameApp.store.get().screen === 'farm' && (
          <div class="rule-row">
            <div class="rule-label">
              <span>Tutorial</span>
              <small>Walk through the basics again on this farm.</small>
            </div>
            <button type="button" class="btn btn-small" onClick={() => gameApp.restartTutorial()}>
              Show the tutorial again
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function SettingToggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="rule-row">
      <div class="rule-label">
        <span>{label}</span>
        <small>{hint}</small>
      </div>
      <input type="checkbox" class="switch" role="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}
