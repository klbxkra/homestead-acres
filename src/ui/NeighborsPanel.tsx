/**
 * AI neighbors, their gifts, and solo co-op jobs (PLAN.md section 4.8).
 */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Session } from '../app/session';
import { toast, visitNeighbor } from '../app/uiState';
import type { NeighborsTab } from '../app/uiState';
import type { Content, ContractDef } from '../content';
import {
  activeNeighbors,
  availableContracts,
  contractDef,
  contractDurationMs,
  contractStatus,
  contractTotal,
  helpsLeft,
  lookup,
  medalFor,
  medalReward,
  neighborLevel,
} from '../core';
import type { ActiveContract, GameState, Medal, NeighborState, PlayerState } from '../core';
import { cropArt, itemArtCss, itemIcon } from '../game/art/artData';
import { formatDuration, formatNumber, withArticle } from './format';
import { useGameState, useStore } from './hooks';

const MEDALS: Record<Medal, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };

export function NeighborsPanel({ session }: { session: Session }) {
  const { ui, transport } = session;
  const s = useStore(ui);
  const state = useGameState(transport);
  if (s.panel !== 'neighbors') return null;
  const player = state.players[state.localPlayerId]!;
  const close = () => ui.set({ panel: null });
  const mail = player.social.mailbox.length;
  const job = player.contract;
  const jobDone = job !== null && contractStatus(job, state.clock.gameNow) !== 'active';

  const tabs: { id: NeighborsTab; label: ComponentChildren }[] = [
    { id: 'neighbors', label: '👥 Neighbors' },
    { id: 'mailbox', label: `📬 Mailbox${mail ? ` (${mail})` : ''}` },
    {
      id: 'jobs',
      label: (
        <>
          📋 <span class="wide-only">Co-op </span>Jobs{jobDone ? ' ❗' : ''}
        </>
      ),
    },
  ];

  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="market" role="dialog" aria-label="Neighbors" onClick={(e) => e.stopPropagation()}>
        <div class="market-header">
          <h2>Neighbors</h2>
          <div class="tabs tabs-scroll" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={s.neighborsTab === t.id}
                class={`tab ${s.neighborsTab === t.id ? 'active' : ''}`}
                onClick={() => ui.set({ neighborsTab: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" class="close-btn" aria-label="Close" onClick={close}>
            ✖
          </button>
        </div>
        <div class="book-body">
          {s.neighborsTab === 'neighbors' && <NeighborList session={session} state={state} player={player} />}
          {s.neighborsTab === 'mailbox' && <Mailbox session={session} player={player} />}
          {s.neighborsTab === 'jobs' && <Jobs session={session} state={state} player={player} />}
        </div>
      </div>
    </div>
  );
}

export function Avatar({ neighbor, size = 'normal' }: { neighbor: NeighborState; size?: 'normal' | 'small' }) {
  return (
    <span class={`avatar ${size === 'small' ? 'avatar-small' : ''}`} style={{ background: neighbor.color }} aria-hidden="true">
      {neighbor.avatar}
    </span>
  );
}

function hearts(n: NeighborState): string {
  const full = Math.min(5, Math.floor(n.helpsGiven / 10));
  return '♥'.repeat(full) + '♡'.repeat(5 - full);
}

// ---------------------------------------------------------------- neighbors

function NeighborList({ session, state, player }: { session: Session; state: GameState; player: PlayerState }) {
  const { ui, transport } = session;
  const content = transport.content;
  const now = state.clock.gameNow;
  const list = activeNeighbors(player, state.rules);
  if (!list.length) return <p class="market-empty">These World Rules have no AI neighbors. Raise "AI neighbors" in Settings → World rules to meet some.</p>;
  const names = new Map(list.map((n) => [n.id, n]));
  const log = [...player.social.log].reverse().slice(0, 8);

  return (
    <>
      <p class="settings-intro">
        Visit to help on their farms: +{formatNumber(content.base.neighbors.helpCoins * state.rules.coinYield)} coins each time, {state.rules.neighborHelpsPerDay} times
        per neighbor per day, and a thank-you gift when you've done them all. They drop by too, to fertilize your crops and feed your animals.
      </p>
      <div class="neighbor-grid">
        {list.map((n) => {
          const left = helpsLeft(n, now, state.rules);
          return (
            <div key={n.id} class="neighbor-card">
              <Avatar neighbor={n} />
              <span class="card-name">{n.name}</span>
              <span class="card-line">
                Level {neighborLevel(n, player, content)} ·{' '}
                <span class="hearts" title={`Friendship: ${n.helpsGiven} helps given`}>
                  {hearts(n)}
                </span>
              </span>
              <span class="card-line">{left > 0 ? `${left} of ${state.rules.neighborHelpsPerDay} helps left today` : 'All helped today ✅'}</span>
              <button type="button" class="btn btn-small btn-primary" onClick={() => visitNeighbor(ui, n.id)}>
                Visit
              </button>
            </div>
          );
        })}
      </div>
      {log.length > 0 && (
        <>
          <h3 class="section-title">Recent visits to your farm</h3>
          <ul class="activity-log">
            {log.map((e, i) => {
              const n = names.get(e.neighborId);
              const what = e.kind === 'fertilized' ? `fertilized ${e.count} ${e.count === 1 ? 'crop' : 'crops'}` : `fed ${e.count} ${e.count === 1 ? 'animal' : 'animals'}`;
              return (
                <li key={i}>
                  {n && <Avatar neighbor={n} size="small" />} <b>{n?.name ?? 'A neighbor'}</b> {what}
                  <span class="muted"> · {formatDuration(Math.max(0, now - e.at) / state.rules.timeScale)} ago</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- mailbox

function itemName(content: Content, itemId: string): string {
  return lookup(content.placeables, itemId)?.name ?? lookup(content.supplies, itemId)?.name ?? itemId;
}

function Mailbox({ session, player }: { session: Session; player: PlayerState }) {
  const { ui, transport } = session;
  const content = transport.content;
  const mail = player.social.mailbox;
  const names = new Map(player.social.neighbors.map((n) => [n.id, n]));
  const accept = (mailIds?: string[]) => {
    const result = transport.send(mailIds ? { type: 'acceptGifts', mailIds } : { type: 'acceptGifts' });
    if (!result.ok) toast(ui, result.error.message, 'error');
  };
  if (!mail.length) return <p class="market-empty">No gifts right now. Neighbors send new ones every day.</p>;
  return (
    <>
      <div class="mail-head">
        <span class="muted">
          {mail.length} / {content.base.neighbors.mailboxMax} gifts waiting. Accepted gifts go to your 🎁 gift box.
        </span>
        <button type="button" class="btn btn-primary" onClick={() => accept()}>
          Accept all
        </button>
      </div>
      <div class="book-rows">
        {mail.map((m) => {
          const n = names.get(m.neighborId);
          return (
            <div key={m.id} class="book-row mail-row">
              {n ? <Avatar neighbor={n} size="small" /> : <span />}
              <span class="book-name">
                <b>{n?.name ?? 'A neighbor'}</b> sent {m.count > 1 ? `${m.count} × ${itemName(content, m.itemId)}` : withArticle(itemName(content, m.itemId))}
              </span>
              <span class="swatch small" style={{ background: itemArtCss(m.itemId) }}>
                {itemIcon(m.itemId)}
              </span>
              <button type="button" class="btn btn-small" onClick={() => accept([m.id])}>
                Accept
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- co-op jobs

function Jobs({ session, state, player }: { session: Session; state: GameState; player: PlayerState }) {
  const content = session.transport.content;
  if (player.contract) return <ActiveJob session={session} state={state} player={player} job={player.contract} />;
  const open = availableContracts(player, content);
  const locked = content.contracts.filter((c) => c.unlockLevel > player.level).slice(0, 2);
  return (
    <>
      <p class="settings-intro">
        Grow the crops a job asks for before time runs out. Up to {content.base.contracts.maxPartners} neighbors can help: each grows a share every day. Finish in the
        first half of the time for 🥇 gold, by three quarters for 🥈 silver, or before the end for 🥉 bronze.
      </p>
      <div class="job-list">
        {open.map((c) => (
          <JobCard key={c.id} session={session} state={state} player={player} def={c} />
        ))}
        {locked.map((c) => (
          <div key={c.id} class="job-card locked">
            <span class="card-name">{c.name}</span>
            <span class="card-lock">🔒 Level {c.unlockLevel}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function realTime(gameMs: number, state: GameState): string {
  return formatDuration(gameMs / state.rules.timeScale);
}

function JobCard({ session, state, player, def }: { session: Session; state: GameState; player: PlayerState; def: ContractDef }) {
  const { ui, transport } = session;
  const content = transport.content;
  const neighbors = activeNeighbors(player, state.rules);
  const max = content.base.contracts.maxPartners;
  const [partners, setPartners] = useState<string[]>(() => neighbors.slice(0, max).map((n) => n.id));
  const [open, setOpen] = useState(false);
  const best = lookup(player.contractMedals, def.id);
  const durationMs = contractDurationMs(def, state.rules);
  const toggle = (id: string) =>
    setPartners((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < max ? [...p, id] : p));
  const start = () => {
    const result = transport.send({ type: 'startContract', contractId: def.id, partners });
    if (!result.ok) toast(ui, result.error.message, 'error');
  };
  return (
    <div class="job-card">
      <div class="job-title">
        <span class="card-name">{def.name}</span>
        {best && <span title={`Best: ${best}`}>{MEDALS[best]}</span>}
      </div>
      <span class="card-line muted">{def.description}</span>
      <div class="job-goals">
        {def.goals.map((g) => (
          <span key={g.cropId} class="job-goal">
            <span class="swatch tiny" style={{ background: cropArt(g.cropId).css }} />
            {g.count} {lookup(content.crops, g.cropId)?.name ?? g.cropId}
          </span>
        ))}
      </div>
      <span class="card-line">
        ⏱ {realTime(durationMs, state)} · 🥇 🪙 {formatNumber(def.reward.coins)} +{def.reward.xp} XP{def.reward.cash ? ` +${def.reward.cash} 💵` : ''}
      </span>
      {open ? (
        <div class="job-start">
          {neighbors.length > 0 && <span class="muted small">Who helps? (up to {max})</span>}
          <div class="partner-chips">
            {neighbors.map((n) => (
              <button key={n.id} type="button" class={`chip ${partners.includes(n.id) ? 'active' : ''}`} aria-pressed={partners.includes(n.id)} onClick={() => toggle(n.id)}>
                <Avatar neighbor={n} size="small" /> {n.name}
              </button>
            ))}
          </div>
          <div class="dialog-buttons">
            <button type="button" class="btn btn-small" onClick={() => setOpen(false)}>
              Back
            </button>
            <button type="button" class="btn btn-small btn-primary" onClick={start}>
              Start job
            </button>
          </div>
        </div>
      ) : (
        <button type="button" class="btn btn-small btn-primary" onClick={() => setOpen(true)}>
          Choose this job
        </button>
      )}
    </div>
  );
}

function ActiveJob({ session, state, player, job }: { session: Session; state: GameState; player: PlayerState; job: ActiveContract }) {
  const { ui, transport } = session;
  const content = transport.content;
  const def = contractDef(content, job.contractId);
  const now = state.clock.gameNow;
  const status = contractStatus(job, now);
  const length = job.endsAt - job.startedAt;
  const c = content.base.contracts;
  const names = new Map(player.social.neighbors.map((n) => [n.id, n]));
  const send = (type: 'claimContract' | 'abandonContract') => {
    const result = transport.send({ type });
    if (!result.ok) toast(ui, result.error.message, 'error');
  };
  const abandon = () =>
    ui.set({ confirm: { message: `Give up on ${def?.name ?? 'this job'}? You won't get a reward.`, confirmLabel: 'Give up', onConfirm: () => send('abandonContract') } });
  if (!def) return <p class="market-empty">This job no longer exists. <button type="button" class="btn btn-small" onClick={() => send('claimContract')}>Clear it</button></p>;

  const medalAt = (share: number) => job.startedAt + length * share;
  const medalNow: Medal | null = status === 'complete' ? medalFor(job, job.completedAt!, content) : null;
  const reward = medalNow ? medalReward(def, medalNow, content) : null;

  return (
    <div class="job-card active-job">
      <div class="job-title">
        <span class="card-name">{def.name}</span>
        {status === 'active' && <span class="muted">{realTime(job.endsAt - now, state)} left</span>}
      </div>
      <span class="card-line muted">{def.description}</span>
      {status === 'active' ? (
        <div class="medal-track">
          {(['gold', 'silver', 'bronze'] as const).map((m) => {
            const at = medalAt(m === 'gold' ? c.goldWithin : m === 'silver' ? c.silverWithin : 1);
            const gone = now > at;
            return (
              <span key={m} class={`medal-step ${gone ? 'gone' : ''}`}>
                {MEDALS[m]} {gone ? 'missed' : `within ${realTime(at - now, state)}`}
              </span>
            );
          })}
        </div>
      ) : (
        medalNow && (
          <span class="card-line">
            {MEDALS[medalNow]} <b>{medalNow[0]!.toUpperCase() + medalNow.slice(1)} medal</b>: done in {realTime(job.completedAt! - job.startedAt, state)}
          </span>
        )
      )}
      <div class="job-progress">
        {def.goals.map((g) => {
          const total = Math.min(g.count, contractTotal(job, g.cropId));
          const mine = lookup(job.progress, player.id)?.[g.cropId] ?? 0;
          return (
            <div key={g.cropId} class="goal-row">
              <span class="goal-name">
                <span class="swatch tiny" style={{ background: cropArt(g.cropId).css }} />
                {lookup(content.crops, g.cropId)?.name ?? g.cropId}
              </span>
              <span class="bar">
                <span class="bar-fill" style={{ width: `${Math.min(100, (total / g.count) * 100)}%` }} />
              </span>
              <span class="goal-count">
                {total} / {g.count}
                <small class="muted"> (you {Math.min(mine, g.count)})</small>
              </span>
            </div>
          );
        })}
      </div>
      {job.partners.length > 0 && (
        <span class="card-line">
          Helping:{' '}
          {job.partners.map((id) => {
            const n = names.get(id);
            return n ? (
              <span key={id} class="partner">
                <Avatar neighbor={n} size="small" /> {n.name}
              </span>
            ) : null;
          })}
        </span>
      )}
      <div class="dialog-buttons">
        {status === 'active' && (
          <button type="button" class="btn btn-small" onClick={abandon}>
            Give up
          </button>
        )}
        {status === 'complete' && reward && medalNow && (
          <button type="button" class="btn btn-primary" onClick={() => send('claimContract')}>
            {MEDALS[medalNow]} Claim 🪙 {formatNumber(reward.coins)} +{reward.xp} XP
          </button>
        )}
        {status === 'failed' && (
          <>
            <span class="warn">Time ran out.</span>
            <button type="button" class="btn btn-primary" onClick={() => send('claimContract')}>
              OK
            </button>
          </>
        )}
      </div>
    </div>
  );
}

