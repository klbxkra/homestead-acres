import { afterEach, describe, expect, it } from 'vitest';
import { GameApp } from '../../src/app/GameApp';
import { defaultContent } from '../../src/content';
import { HOUR_MS } from '../../src/core';
import { createEmergencyStore, MemorySaveStore } from '../../src/persistence';
import { T0 } from '../core/harness';

let now = T0;
const apps: GameApp[] = [];

function makeApp(saves = new MemorySaveStore()) {
  const app = new GameApp({ saves, emergency: createEmergencyStore(null), content: defaultContent, now: () => now });
  apps.push(app);
  return { app, saves };
}

afterEach(async () => {
  for (const a of apps.splice(0)) if (a.store.get().screen === 'farm') await a.exitToTitle(); // stops the clock timer
  now = T0;
});

const player = (app: GameApp) => {
  const s = app.session!.transport.getState();
  return s.players[s.localPlayerId]!;
};

describe('GameApp', () => {
  it('creates a farm, saves it, and lists it after exiting', async () => {
    const { app } = makeApp();
    await app.init();
    expect(app.store.get()).toMatchObject({ screen: 'title', slots: [] });

    await app.newFarm({ farmName: '  Maple Hill ', playerName: 'Ada', preset: 'relaxed' });
    expect(app.store.get().screen).toBe('farm');
    const state = app.session!.transport.getState();
    expect(state.farms[state.homeFarmId]!.name).toBe('Maple Hill');
    expect(state.rules.preset).toBe('relaxed');

    app.session!.transport.send({ type: 'plow', x: 0, y: 0 });
    await app.exitToTitle();
    const { slots, screen } = app.store.get();
    expect(screen).toBe('title');
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ farmName: 'Maple Hill', playerName: 'Ada', coins: 185 });
  });

  it('reopens a farm with time caught up and a welcome-back summary', async () => {
    const { app, saves } = makeApp();
    await app.newFarm({ farmName: 'F', playerName: 'P', preset: 'classic' });
    const t = app.session!.transport;
    t.send({ type: 'plow', x: 0, y: 0 });
    t.send({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    await app.exitToTitle();

    // A fresh app instance, as if the browser was closed and reopened 5 hours later.
    now = T0 + 5 * HOUR_MS;
    const { app: reopened } = makeApp(saves);
    await reopened.init();
    await reopened.openSlot(reopened.store.get().slots[0]!.slotId);
    const result = reopened.session!.transport.send({ type: 'harvest', x: 0, y: 0 });
    expect(result.ok).toBe(true);
    expect(reopened.store.get().welcome).toMatchObject({ ripened: 1, withered: 0, ripenedByCrop: { Strawberries: 1 } });
    expect(reopened.store.get().welcome!.awayMs).toBe(5 * HOUR_MS);
  });

  it('honours paused offline progress', async () => {
    const { app, saves } = makeApp();
    await app.newFarm({ farmName: 'F', playerName: 'P', preset: 'idle' }); // idle: timers pause while closed
    const t = app.session!.transport;
    t.send({ type: 'plow', x: 0, y: 0 });
    t.send({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    await app.exitToTitle();

    now = T0 + 24 * HOUR_MS;
    const { app: reopened } = makeApp(saves);
    await reopened.init();
    await reopened.openSlot(reopened.store.get().slots[0]!.slotId);
    expect(reopened.session!.transport.send({ type: 'harvest', x: 0, y: 0 }).ok).toBe(false);
    expect(reopened.store.get().welcome?.timersPaused).toBe(true);
  });

  it('switches between farms in one session', async () => {
    const { app } = makeApp();
    await app.newFarm({ farmName: 'First', playerName: 'P', preset: 'classic' });
    app.session!.transport.send({ type: 'plow', x: 0, y: 0 });
    await app.exitToTitle();
    await app.newFarm({ farmName: 'Second', playerName: 'P', preset: 'classic' });
    expect(player(app).coins).toBe(200);
    await app.exitToTitle();
    const first = app.store.get().slots.find((s) => s.farmName === 'First')!;
    await app.openSlot(first.slotId);
    expect(player(app).coins).toBe(185);
  });

  it('exports and re-imports a farm as a new slot', async () => {
    const { app } = makeApp();
    await app.newFarm({ farmName: 'Export Me', playerName: 'P', preset: 'classic' });
    app.session!.transport.send({ type: 'buy', itemId: 'hay_bale', x: 2, y: 2 });
    const slotId = app.store.get().slotId!;
    const file = await app.exportText(slotId);
    expect(file?.fileName).toBe('Export Me.farm');
    await app.exitToTitle();

    const { app: other } = makeApp(); // a different device
    await other.init();
    const newId = await other.importText(file!.text);
    expect(newId).not.toBeNull();
    expect(other.store.get().slots.map((s) => s.farmName)).toEqual(['Export Me']);
    await other.openSlot(newId!);
    expect(player(other).coins).toBe(180);
  });

  it('renames an import whose farm name is already taken', async () => {
    const { app } = makeApp();
    await app.newFarm({ farmName: 'Twin', playerName: 'P', preset: 'classic' });
    const file = await app.exportText(app.store.get().slotId!);
    await app.exitToTitle();
    await app.importText(file!.text);
    await app.importText(file!.text);
    expect(app.store.get().slots.map((s) => s.farmName).sort()).toEqual(['Twin', 'Twin (imported)', 'Twin (imported) 2']);
  });

  it('rejects bad imports with a message', async () => {
    const { app } = makeApp();
    await app.init();
    expect(await app.importText('not json')).toBeNull();
    expect(app.store.get().notice?.kind).toBe('error');
    expect(await app.importText(JSON.stringify({ format: 'homestead-acres-save', schemaVersion: 1, savedAt: 1, checksum: 'x', state: {} }))).toBeNull();
    expect(app.store.get().slots).toEqual([]);
  });

  it('restores a backup when the main save is damaged, without keeping the damaged copy as a backup', async () => {
    const { app, saves } = makeApp();
    await app.newFarm({ farmName: 'F', playerName: 'P', preset: 'classic' });
    app.session!.transport.send({ type: 'plow', x: 0, y: 0 });
    await app.exitToTitle();
    const slotId = app.store.get().slots[0]!.slotId;
    const records = await saves.read(slotId);
    const backupsBefore = records!.backups.length;
    const damaged = structuredClone(records!.main) as { state: { rng: number } };
    damaged.state.rng += 1;
    saves.poke(slotId, { main: damaged });

    await app.openSlot(slotId);
    expect(app.store.get().notice?.text).toMatch(/backup/);
    await app.exitToTitle();
    const after = await saves.read(slotId);
    expect(after!.backups).toHaveLength(backupsBefore);
    expect(after!.backups).not.toContainEqual(damaged);
  });

  it('deletes farms, but not the one that is open', async () => {
    const { app } = makeApp();
    await app.newFarm({ farmName: 'Keep', playerName: 'P', preset: 'classic' });
    const openId = app.store.get().slotId!;
    await app.deleteSlot(openId);
    await app.exitToTitle();
    expect(app.store.get().slots).toHaveLength(1);
    await app.deleteSlot(openId);
    expect(app.store.get().slots).toHaveLength(0);
  });
});
