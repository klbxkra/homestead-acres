/**
 * Level-up celebration: a big banner with confetti over the farm, drawn by the
 * UI layer so it's the same size at any zoom. Confetti is skipped in battery
 * saver and for people who prefer reduced motion (the banner stays).
 */
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../app/session';
import { useStore } from './hooks';

const SHOW_MS = 2200;
const COLORS = ['#ffd54f', '#ef5350', '#66bb6a', '#42a5f5', '#ffffff', '#ab47bc'];

interface Party {
  id: number;
  level: number;
  cash: number;
}

export function Celebration({ session }: { session: Session }) {
  const { batterySaver } = useStore(session.settings);
  const [party, setParty] = useState<Party | null>(null);

  useEffect(() => {
    let id = 0;
    return session.transport.subscribe((_state, events) => {
      for (const e of events) if (e.type === 'levelUp') setParty({ id: ++id, level: e.level, cash: e.cashReward });
    });
  }, [session.transport]);

  useEffect(() => {
    if (!party) return;
    const t = setTimeout(() => setParty(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [party]);

  if (!party) return null;
  return (
    <div class="celebration" key={party.id} aria-live="assertive">
      {!batterySaver && (
        <div class="confetti" aria-hidden="true">
          {Array.from({ length: 40 }, (_, i) => (
            <span
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                background: COLORS[i % COLORS.length],
                animationDelay: `${(i % 10) * 40}ms`,
                animationDuration: `${1300 + ((i * 53) % 700)}ms`,
                transform: `rotate(${(i * 47) % 360}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <div class="level-banner">
        <span class="level-banner-title">Level {party.level}!</span>
        {party.cash > 0 && <span class="level-banner-sub">+{party.cash} Farm Cash</span>}
      </div>
    </div>
  );
}
