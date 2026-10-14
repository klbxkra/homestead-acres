/**
 * World Rules editor (PLAN.md section 5): presets, sliders for every rate, and
 * per-item tweaks. Used for an open farm (Settings) and for a new farm (title screen).
 */
import { useRef } from 'preact/hooks';
import type { Content } from '../content';
import { matchingPreset, PRESET_IDS, rulesForPreset, validateRules } from '../core';
import type { ItemOverride, OfflineProgress, PresetId, WorldRules } from '../core';
import { downloadTextFile, readTextFile } from '../platform/files';
import { PRESET_INFO } from './presets';
import { formatGrowth, formatHours, formatMultiplier, formatTimeScale, nearestStopIndex, STOPS } from './rulesFormat';

const HOUR_MS = 60 * 60 * 1000;

export interface RulesEditorProps {
  rules: WorldRules;
  onChange: (rules: WorldRules) => void;
  /** 'new' shows starting coins/cash; 'farm' explains when changes take effect. */
  mode: 'new' | 'farm';
  content: Content;
  onError: (message: string) => void;
}

export function RulesEditor({ rules, onChange, mode, content, onError }: RulesEditorProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<WorldRules>) => {
    const next = { ...rules, ...patch };
    onChange({ ...next, preset: matchingPreset(next) ?? 'custom' });
  };

  const choosePreset = (id: PresetId) => {
    const base = rulesForPreset(id);
    // An open farm keeps its starting values (they no longer matter); a new farm takes the preset's.
    onChange(mode === 'farm' ? { ...base, startingCoins: rules.startingCoins, startingCash: rules.startingCash } : base);
  };

  const exportRules = () => downloadTextFile('homestead-acres-rules.json', JSON.stringify(rules, null, 2));

  const importRules = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const checked = validateRules(JSON.parse(await readTextFile(file)));
      if (!checked.ok) return onError(`Those rules couldn't be used: ${checked.error}`);
      onChange({ ...checked.rules, preset: matchingPreset(checked.rules) ?? 'custom' });
    } catch {
      onError('That file is not a rules file.');
    }
  };

  return (
    <div class="rules-editor">
      <section>
        <h3>Preset</h3>
        <div class="segmented" role="radiogroup" aria-label="Preset">
          {PRESET_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={rules.preset === id}
              class={rules.preset === id ? 'active' : ''}
              title={PRESET_INFO[id].blurb}
              onClick={() => choosePreset(id)}
            >
              {PRESET_INFO[id].name}
            </button>
          ))}
          <span class={`segmented-note ${rules.preset === 'custom' ? 'active' : ''}`}>Custom</span>
        </div>
      </section>

      <section>
        <h3>Time</h3>
        <StopSlider
          label="Game speed"
          hint="How fast game time runs compared to real time."
          stops={STOPS.timeScale}
          value={rules.timeScale}
          format={formatTimeScale}
          onChange={(timeScale) => update({ timeScale })}
        />
        <StopSlider
          label="Crop grow time"
          hint={mode === 'farm' ? 'Applies to crops planted from now on.' : 'Lower is faster.'}
          stops={STOPS.cropGrowth}
          value={rules.cropGrowth}
          format={formatGrowth}
          onChange={(cropGrowth) => update({ cropGrowth })}
        />
        <div class="rule-row">
          <div class="rule-label">
            <span>While the game is closed</span>
            <small>What happens to crop timers when you're away.</small>
          </div>
          <Segmented<OfflineProgress>
            value={rules.offlineProgress}
            options={[
              ['full', 'Keep growing'],
              ['capped', 'Grow, with a limit'],
              ['paused', 'Pause'],
            ]}
            onChange={(offlineProgress) => update({ offlineProgress })}
          />
        </div>
        {rules.offlineProgress === 'capped' && (
          <StopSlider
            label="Growing limit while away"
            stops={STOPS.offlineCapHours}
            value={rules.offlineCapHours}
            format={formatHours}
            onChange={(offlineCapHours) => update({ offlineCapHours })}
          />
        )}
      </section>

      <section>
        <h3>Crops</h3>
        <Toggle
          label="Crops wither"
          hint="Ripe crops die if you don't harvest them in time."
          checked={rules.witherEnabled}
          onChange={(witherEnabled) => update({ witherEnabled })}
        />
        {rules.witherEnabled && (
          <StopSlider
            label="Time to harvest"
            hint="How long crops stay ripe, compared to how long they took to grow."
            stops={STOPS.witherWindowFactor}
            value={rules.witherWindowFactor}
            format={formatMultiplier}
            onChange={(witherWindowFactor) => update({ witherWindowFactor })}
          />
        )}
        <Toggle
          label="Plots stay plowed after harvest"
          hint="Skip re-plowing (in the original, harvested plots must be plowed again)."
          checked={rules.keepPlowedAfterHarvest}
          onChange={(keepPlowedAfterHarvest) => update({ keepPlowedAfterHarvest })}
        />
      </section>

      <section>
        <h3>Economy</h3>
        <StopSlider label="Coins from harvests" stops={STOPS.reward} value={rules.coinYield} format={formatMultiplier} onChange={(coinYield) => update({ coinYield })} />
        <StopSlider label="XP earned" stops={STOPS.reward} value={rules.xpGain} format={formatMultiplier} onChange={(xpGain) => update({ xpGain })} />
        <StopSlider label="Prices (seeds, decorations)" stops={STOPS.cost} value={rules.buyCost} format={formatMultiplier} onChange={(buyCost) => update({ buyCost })} />
        <StopSlider label="Plowing fee" stops={STOPS.cost} value={rules.plowCost} format={formatMultiplier} onChange={(plowCost) => update({ plowCost })} />
        <StopSlider
          label="Farm Cash rewards"
          hint="Farm Cash earned when you level up."
          stops={STOPS.reward}
          value={rules.farmCashEarnRate}
          format={formatMultiplier}
          onChange={(farmCashEarnRate) => update({ farmCashEarnRate })}
        />
      </section>

      {mode === 'new' && (
        <section>
          <h3>Starting out</h3>
          <StopSlider label="Starting coins" stops={STOPS.startingCoins} value={rules.startingCoins} format={(v) => v.toLocaleString('en-US')} onChange={(startingCoins) => update({ startingCoins })} />
          <StopSlider label="Starting Farm Cash" stops={STOPS.startingCash} value={rules.startingCash} format={(v) => v.toLocaleString('en-US')} onChange={(startingCash) => update({ startingCash })} />
        </section>
      )}

      <details class="rules-items">
        <summary>Per-item tweaks</summary>
        <p class="muted small">Leave a box empty to use the normal value. Global multipliers above still apply on top.</p>
        <ItemOverrides rules={rules} content={content} onChange={(overrides) => update({ overrides })} />
      </details>

      <div class="rules-files">
        <button type="button" class="btn" onClick={exportRules}>
          📤 Export rules
        </button>
        <button type="button" class="btn" onClick={() => fileInput.current?.click()}>
          📥 Import rules
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importRules} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- controls

function StopSlider({
  label,
  hint,
  stops,
  value,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  stops: readonly number[];
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const index = nearestStopIndex(stops, value);
  const offStop = stops[index] !== value;
  return (
    <label class="rule-row">
      <div class="rule-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div class="rule-control">
        <input
          type="range"
          min={0}
          max={stops.length - 1}
          step={1}
          value={index}
          onInput={(e) => onChange(stops[Number(e.currentTarget.value)]!)}
        />
        <output>
          {format(value)}
          {offStop && ' *'}
        </output>
      </div>
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="rule-row">
      <div class="rule-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <input type="checkbox" class="switch" role="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="segmented" role="radiogroup">
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} class={value === v ? 'active' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- per-item overrides

type OverrideField = keyof ItemOverride;

function ItemOverrides({ rules, content, onChange }: { rules: WorldRules; content: Content; onChange: (o: WorldRules['overrides']) => void }) {
  const set = (itemId: string, field: OverrideField, raw: string) => {
    const next: WorldRules['overrides'] = { ...rules.overrides };
    const current: ItemOverride = { ...(Object.hasOwn(next, itemId) ? next[itemId] : {}) };
    const n = raw.trim() === '' ? NaN : Number(raw);
    if (Number.isFinite(n) && n >= 0) current[field] = field === 'growMs' ? Math.max(1000, Math.round(n * HOUR_MS)) : n;
    else delete current[field];
    if (Object.keys(current).length) next[itemId] = current;
    else delete next[itemId];
    onChange(next);
  };

  const value = (itemId: string, field: OverrideField): string => {
    const v = Object.hasOwn(rules.overrides, itemId) ? rules.overrides[itemId]?.[field] : undefined;
    if (v === undefined) return '';
    return field === 'growMs' ? String(Number((v / HOUR_MS).toFixed(4))) : String(v);
  };

  const crops = Object.values(content.crops).sort((a, b) => a.unlockLevel - b.unlockLevel);
  const decorations = Object.values(content.decorations).sort((a, b) => a.unlockLevel - b.unlockLevel);

  return (
    <div class="override-tables">
      <table class="override-table">
        <thead>
          <tr>
            <th>Crop</th>
            <th>Grow (hours)</th>
            <th>Seed cost</th>
            <th>Sells for</th>
            <th>XP</th>
          </tr>
        </thead>
        <tbody>
          {crops.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <NumberCell value={value(c.id, 'growMs')} placeholder={String(c.growMs / HOUR_MS)} onInput={(v) => set(c.id, 'growMs', v)} />
              <NumberCell value={value(c.id, 'cost')} placeholder={String(c.cost)} onInput={(v) => set(c.id, 'cost', v)} />
              <NumberCell value={value(c.id, 'sellPrice')} placeholder={String(c.sellPrice)} onInput={(v) => set(c.id, 'sellPrice', v)} />
              <NumberCell value={value(c.id, 'xp')} placeholder={String(c.xp)} onInput={(v) => set(c.id, 'xp', v)} />
            </tr>
          ))}
        </tbody>
      </table>
      <table class="override-table">
        <thead>
          <tr>
            <th>Decoration</th>
            <th>Cost</th>
            <th>XP</th>
          </tr>
        </thead>
        <tbody>
          {decorations.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <NumberCell value={value(d.id, 'cost')} placeholder={String(d.cost)} onInput={(v) => set(d.id, 'cost', v)} />
              <NumberCell value={value(d.id, 'xp')} placeholder={String(d.xp)} onInput={(v) => set(d.id, 'xp', v)} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NumberCell({ value, placeholder, onInput }: { value: string; placeholder: string; onInput: (v: string) => void }) {
  return (
    <td>
      <input type="number" inputMode="decimal" min={0} step="any" value={value} placeholder={placeholder} onChange={(e) => onInput(e.currentTarget.value)} />
    </td>
  );
}
