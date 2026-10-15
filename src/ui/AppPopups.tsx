import { useEffect, useState } from 'preact/hooks';
import type { GameApp } from '../app/GameApp';
import type { Session } from '../app/session';
import { toast } from '../app/uiState';
import { dailyStatus } from '../core';
import { formatDuration, formatNumber } from './format';
import { useGameState, useStore } from './hooks';

/** Offers the daily bonus once per farm visit, after any welcome-back message. */
export function DailyBonus({ gameApp, session }: { gameApp: GameApp; session: Session }) {
  const { welcome, slotId } = useStore(gameApp.store);
  const state = useGameState(session.transport);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const player = state.players[state.localPlayerId]!;
  const status = dailyStatus(player, state.clock.realNow, session.transport.content);
  if (welcome || !status.available || dismissedFor === slotId) return null;

  const days = session.transport.content.base.dailyBonus.days;
  const reward = days[Math.min(status.nextStreak, days.length) - 1]!;
  const close = () => setDismissedFor(slotId);
  const claim = () => {
    const result = session.transport.send({ type: 'claimDailyBonus' });
    if (result.ok) toast(session.ui, `Daily bonus: +${formatNumber(reward.coins)} coins!`, 'success');
    close();
  };

  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="dialog welcome" role="dialog" aria-label="Daily bonus" onClick={(e) => e.stopPropagation()}>
        <h2>🌞 Daily bonus: day {status.nextStreak}</h2>
        <div class="daily-days">
          {days.map((d, i) => (
            <span key={i} class={`daily-day ${i + 1 === Math.min(status.nextStreak, days.length) ? 'today' : ''} ${i + 1 < status.nextStreak ? 'done' : ''}`}>
              <small>Day {i + 1}{i === days.length - 1 ? '+' : ''}</small>
              <b>🪙 {d.coins}</b>
              {d.cash > 0 && <small>💵 {d.cash}</small>}
            </span>
          ))}
        </div>
        <p class="muted">Come back every day to grow your streak. Missing a day starts it over.</p>
        <div class="dialog-buttons">
          <button type="button" class="btn" onClick={close}>
            Later
          </button>
          <button type="button" class="btn btn-primary" onClick={claim}>
            Collect 🪙 {formatNumber(reward.coins)}
          </button>
        </div>
      </div>
    </div>
  );
}

const NOTICE_MS = 7000;

/** App-level messages (load problems, import results), shown on any screen. */
export function AppNotice({ gameApp }: { gameApp: GameApp }) {
  const { notice } = useStore(gameApp.store);

  useEffect(() => {
    if (!notice || notice.kind === 'error') return; // errors stay until dismissed
    const t = setTimeout(() => gameApp.dismissNotice(), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice, gameApp]);

  if (!notice) return null;
  return (
    <div class="app-notice interactive" role="status">
      <div class={`toast toast-${notice.kind}`}>
        <span>{notice.text}</span>
        <button type="button" class="notice-close" aria-label="Dismiss" onClick={() => gameApp.dismissNotice()}>
          ✖
        </button>
      </div>
    </div>
  );
}

export function WelcomeBack({ gameApp }: { gameApp: GameApp }) {
  const { welcome, screen } = useStore(gameApp.store);
  if (!welcome || screen !== 'farm') return null;
  const crops = Object.entries(welcome.ripenedByCrop)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, n]) => `${n} ${name}`)
    .join(', ');

  return (
    <div class="modal-backdrop interactive" onClick={() => gameApp.dismissWelcome()}>
      <div class="dialog welcome" role="dialog" aria-label="Welcome back" onClick={(e) => e.stopPropagation()}>
        <h2>Welcome back to {welcome.farmName}!</h2>
        <p class="muted">You were away for {formatDuration(welcome.awayMs)}.</p>
        {welcome.timersPaused ? (
          <p>Your crops waited for you: timers pause while the game is closed on these rules.</p>
        ) : (
          <>
            {welcome.ripened > 0 && (
              <p>
                🧺 <b>{welcome.ripened}</b> {welcome.ripened === 1 ? 'crop is' : 'crops are'} ready to harvest
                {crops && <span class="muted"> ({crops})</span>}.
              </p>
            )}
            {welcome.withered > 0 && (
              <p class="warn">
                🥀 <b>{welcome.withered}</b> {welcome.withered === 1 ? 'crop' : 'crops'} withered. Plow over{' '}
                {welcome.withered === 1 ? 'it' : 'them'} to replant.
              </p>
            )}
            {welcome.ripened === 0 && welcome.withered === 0 && <p>Everything is still growing.</p>}
          </>
        )}
        <div class="dialog-buttons">
          <button type="button" class="btn btn-primary" onClick={() => gameApp.dismissWelcome()}>
            Let's farm!
          </button>
        </div>
      </div>
    </div>
  );
}
