import { useEffect, useState } from 'preact/hooks';
import type { GameApp } from '../app/GameApp';
import type { Session } from '../app/session';
import { GAME_VERSION } from '../config';
import { isTouchPrimary, renderPixelRatio, viewportSize } from '../platform/device';
import { AppNotice, WelcomeBack } from './AppPopups';
import { GameMenu } from './GameMenu';
import { useStore } from './hooks';
import { Hud } from './Hud';
import { Market } from './Market';
import { ConfirmDialog, Toasts, TooltipView } from './Popups';
import { TitleScreen } from './TitleScreen';
import { Toolbar } from './Toolbar';

export function App({ gameApp }: { gameApp: GameApp }) {
  const { screen } = useStore(gameApp.store);
  const session = gameApp.session;
  return (
    <>
      {screen === 'farm' && session ? <FarmUi gameApp={gameApp} session={session} /> : <TitleScreen gameApp={gameApp} />}
      <WelcomeBack gameApp={gameApp} />
      <AppNotice gameApp={gameApp} />
      {import.meta.env.DEV && <DebugInfo />}
      <div class="rotate-overlay">
        <div class="icon">📱</div>
        <div>Rotate your phone to landscape to play.</div>
      </div>
    </>
  );
}

function FarmUi({ gameApp, session }: { gameApp: GameApp; session: Session }) {
  return (
    <>
      <Hud session={session} menu={<GameMenu gameApp={gameApp} />} />
      <Toolbar session={session} />
      <TooltipView session={session} />
      <Toasts session={session} />
      <Market session={session} />
      <ConfirmDialog session={session} />
    </>
  );
}

function DebugInfo() {
  const [info, setInfo] = useState(describe);

  useEffect(() => {
    const update = () => setInfo(describe());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return <div class="debug-info">{info}</div>;
}

function describe(): string {
  const { width, height } = viewportSize();
  const input = isTouchPrimary() ? 'touch' : 'mouse';
  return `v${GAME_VERSION} · ${width}×${height} @${renderPixelRatio()}x · ${input}`;
}
