/** The first-time tutorial's coach card (see app/tutorial.ts). */
import { useEffect, useState } from 'preact/hooks';
import type { GameApp } from '../app/GameApp';
import type { Session } from '../app/session';
import { eventCompletes, nextStep, TUTORIAL_STEPS, uiCompletes } from '../app/tutorial';
import type { TutorialStep } from '../app/tutorial';
import { useGameState, useStore } from './hooks';

export function TutorialCoach({ gameApp, session }: { gameApp: GameApp; session: Session }) {
  const { slotId, welcome } = useStore(gameApp.store);
  const ui = useStore(session.ui);
  const state = useGameState(session.transport);
  const [step, setStep] = useState<TutorialStep | null>(() => (slotId ? gameApp.tutorial.get(slotId) : null));
  const hasNeighbors = state.rules.aiNeighborCount > 0;

  useEffect(() => setStep(slotId ? gameApp.tutorial.get(slotId) : null), [slotId, gameApp, gameApp.tutorialVersion]);

  const advance = (from: TutorialStep) => {
    if (!slotId) return;
    const next = nextStep(from, { hasNeighbors });
    gameApp.tutorial.set(slotId, next);
    setStep(next);
  };

  // Steps finished by something happening in the game.
  useEffect(() => {
    if (!step || step === 'done') return;
    return session.transport.subscribe((_s, events) => {
      if (events.some((e) => eventCompletes(step, e))) advance(step);
    });
  });

  // Steps finished in the UI (choosing seeds).
  useEffect(() => {
    if (step && uiCompletes(step, ui)) advance(step);
  }, [step, ui]);

  // Point at the button the step is about.
  const info = TUTORIAL_STEPS.find((s) => s.id === step);
  useEffect(() => {
    if (!info?.target || ui.visiting) return;
    const el = document.querySelector(`[data-tour="${info.target}"]`);
    el?.classList.add('tour-pulse');
    return () => el?.classList.remove('tour-pulse');
  }, [info?.target, ui.visiting, ui.panel, ui.marketOpen]);

  if (!step || !slotId || welcome) return null;
  const finish = () => {
    gameApp.tutorial.set(slotId, 'done');
    setStep(null);
  };
  if (step === 'done') {
    return (
      <div class="coach interactive" role="status">
        <b>🎉 You're all set!</b>
        <p>Keep planting to level up and unlock new crops, trees and animals. ☰ Menu → How to play has every control.</p>
        <button type="button" class="btn btn-small btn-primary" onClick={finish}>
          Let's farm
        </button>
      </div>
    );
  }
  const steps = TUTORIAL_STEPS.filter((s) => s.id !== 'neighbors' || hasNeighbors);
  const index = steps.findIndex((s) => s.id === step);
  return (
    <div class="coach interactive" role="status">
      <div class="coach-head">
        <b>{info?.title}</b>
        <span class="coach-dots" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <span key={s.id} class={i <= index ? 'on' : ''} />
          ))}
        </span>
      </div>
      <p>{info?.text}</p>
      <button type="button" class="link-btn" onClick={finish}>
        Skip tutorial
      </button>
    </div>
  );
}
