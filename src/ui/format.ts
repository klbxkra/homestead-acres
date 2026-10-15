import type { Content } from '../content';
import {
  cropHarvestCoins,
  cropStatus,
  cropWitherAt,
  entityAt,
  itemRefund,
  lookup,
  nextReadyAt,
  plowCost,
  productionYield,
} from '../core';
import type { FarmState, WorldRules } from '../core';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact duration: "45s", "2m 24s", "12m", "2h 13m", "3d 4h". */
export function formatDuration(ms: number): string {
  const t = Math.max(0, ms);
  if (t < MINUTE) return `${Math.ceil(t / SECOND)}s`;
  if (t < 10 * MINUTE) {
    const total = Math.ceil(t / SECOND);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  if (t < HOUR) return `${Math.ceil(t / MINUTE)}m`;
  if (t < DAY) {
    const h = Math.floor(t / HOUR);
    const m = Math.floor((t % HOUR) / MINUTE);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(t / DAY);
  const h = Math.floor((t % DAY) / HOUR);
  return h ? `${d}d ${h}h` : `${d}d`;
}

export function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

export interface TileDescription {
  title: string;
  lines: string[];
}

/** Tooltip text for a tile. Waiting times are shown in real time (game time / timeScale). */
export function describeTile(
  farm: FarmState,
  x: number,
  y: number,
  gameNow: number,
  rules: WorldRules,
  content: Content,
): TileDescription | null {
  if (x < 0 || y < 0 || x >= farm.width || y >= farm.height) return null;
  const real = (gameMs: number) => formatDuration(gameMs / rules.timeScale);
  const entity = entityAt(farm, x, y, content);

  if (!entity) return { title: 'Grass', lines: [`Plow for ${plowCost(content, rules)} coins`] };

  if (entity.kind !== 'plot') {
    const item = lookup(content.placeables, entity.itemId);
    if (!item) return { title: 'Unknown item', lines: [] };
    const refund = itemRefund(item, content, rules);
    const sells = refund > 0 ? `Sells for ${formatNumber(refund)} coins` : 'Reward item';

    if (entity.kind === 'tree' || entity.kind === 'animal') {
      const def = entity.kind === 'tree' ? lookup(content.trees, entity.itemId) : lookup(content.animals, entity.itemId);
      const pays = def ? productionYield(def, rules) : 0;
      if (gameNow >= entity.readyAt) return { title: `${item.name}: ready!`, lines: [`Collect for ${formatNumber(pays)} coins`] };
      return { title: item.name, lines: [`Ready in ${real(entity.readyAt - gameNow)}`, `Pays ${formatNumber(pays)} coins`] };
    }

    if (entity.kind === 'building') {
      const def = lookup(content.buildings, entity.itemId);
      const lines: string[] = [];
      if (def && def.houses.length) {
        const ready = entity.housed.filter((a) => a.readyAt <= gameNow).length;
        const names = def.houses.map((id) => lookup(content.animals, id)?.name ?? id).join(', ');
        lines.push(`${entity.housed.length} / ${def.capacity} animals (${names})`);
        if (ready > 0) lines.push(`${ready} ready to collect`);
        else {
          const next = nextReadyAt(entity);
          lines.push(next === null ? 'Drop animals here to move them in' : `Next ready in ${real(next - gameNow)}`);
        }
      }
      if (def?.storage) lines.push(`Adds ${def.storage} storage slots`);
      lines.push(sells);
      return { title: item.name, lines };
    }

    return { title: item.name, lines: [sells] };
  }

  if (!entity.crop) {
    return entity.plowed
      ? { title: 'Plowed plot', lines: ['Ready for seeds'] }
      : { title: 'Fallow plot', lines: ['Plow it to plant again'] };
  }

  const crop = lookup(content.crops, entity.crop.cropId);
  const name = crop?.name ?? 'Unknown crop';
  const status = cropStatus(entity.crop, gameNow, rules);
  if (status === 'growing') {
    return { title: name, lines: [`Ready in ${real(entity.crop.readyAt - gameNow)}`] };
  }
  if (status === 'withered') return { title: `${name} (withered)`, lines: ['Plow over it to clear the plot'] };

  const witherAt = cropWitherAt(entity.crop, rules);
  return {
    title: `${name}: ripe!`,
    lines: [
      `Harvest for ${crop ? cropHarvestCoins(crop, rules) : 0} coins`,
      witherAt === null ? 'Never withers' : `Withers in ${real(witherAt - gameNow)}`,
    ],
  };
}
