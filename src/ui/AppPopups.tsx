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

/**
 * Toasts when neighbors send gifts or drop by while you're playing (the
 * welcome-back popup covers what happened while you were away).
 */
export function NeighborNews({ session }: { session: Session }) {
  const { transport, ui } = session;
  useEffect(() => {
    let prev = transport.getState();
    return transport.subscribe((next) => {
      const before = prev.players[prev.localPlayerId]!.social;
      const after = next.players[next.localPlayerId]!.social;
      const beforeNow = prev.clock.gameNow;
      prev = next;
      if (before === after || after.neighbors.length === 0) return;
      const names = new Map(after.neighbors.map((n) => [n.id, n.name]));
      const oldMail = new Set(before.mailbox.map((m) => m.id));
      // Daily gifts are stamped with the start of their day; thank-you and welcome
      // gifts with "now", and those are announced by whatever caused them.
      const sent = after.mailbox.filter((m) => !oldMail.has(m.id) && m.sentAt < next.clock.gameNow);
      if (sent.length === 1) toast(ui, `📬 ${names.get(sent[0]!.neighborId) ?? 'A neighbor'} sent you a gift!`, 'info');
      else if (sent.length > 1) toast(ui, `📬 ${sent.length} new gifts from your neighbors!`, 'info');
      // Visits are stamped with the start of a day that began after the last update.
      for (const e of after.log.filter((x) => x.at > beforeNow).slice(-2)) {
        const who = names.get(e.neighborId) ?? 'A neighbor';
        toast(ui, e.kind === 'fertilized' ? `🌿 ${who} fertilized ${e.count} of your crops.` : `🐔 ${who} fed ${e.count} of your animals.`, 'info');
      }
    });
  }, [transport, ui]);
  return null;
}

/** "A new version is ready" (the service worker downloaded an update). */
export function UpdateBanner({ gameApp }: { gameApp: GameApp }) {
  const { updateReady, busy } = useStore(gameApp.store);
  const [later, setLater] = useState(false);
  if (!updateReady || later) return null;
  return (
    <div class="update-banner interactive" role="status">
      <span>🌱 A new version of the game is ready.</span>
      <button type="button" class="btn btn-small btn-primary" disabled={busy} onClick={() => void gameApp.updateNow()}>
        Update now
      </button>
      <button type="button" class="btn btn-small" onClick={() => setLater(true)}>
        Later
      </button>
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
        {welcome.visits.length > 0 && (
          <p>
            👥 {welcome.visits.slice(0, 3).join('; ')}
            {welcome.visits.length > 3 && <span class="muted"> and {welcome.visits.length - 3} more visits</span>}.
          </p>
        )}
        {welcome.newGifts > 0 && (
          <p>
            📬 <b>{welcome.newGifts}</b> {welcome.newGifts === 1 ? 'gift is' : 'gifts are'} waiting in your mailbox (👥 Neighbors).
          </p>
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
