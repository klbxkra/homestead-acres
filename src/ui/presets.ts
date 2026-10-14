import type { PresetId } from '../core';

export const PRESET_INFO: Record<PresetId, { name: string; blurb: string }> = {
  classic: { name: 'Classic', blurb: 'The original pace. Crops wither if you leave them too long.' },
  relaxed: { name: 'Relaxed', blurb: 'No withering and double coins from harvests.' },
  idle: { name: 'Idle', blurb: 'No withering, faster crops, and timers pause while the game is closed.' },
  speedrun: { name: 'Speed run', blurb: 'Time runs 600× faster with 5× XP. Good for trying things out.' },
};
