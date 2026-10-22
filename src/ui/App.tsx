import { useEffect, useState } from 'preact/hooks';
import type { GameApp } from '../app/GameApp';
import type { Session } from '../app/session';
import { GAME_VERSION } from '../config';
import { isTouchPrimary, renderPixelRatio, viewportSize } from '../platform/device';
import { AppNotice, DailyBonus, NeighborNews, UpdateBanner, WelcomeBack } from './AppPopups';
import { Celebration } from './Celebration';
import { ConstructionDialog } from './ConstructionDialog';
import { FarmerBook } from './FarmerBook';
import { InventoryPanel } from './Inventory';
import { GameMenu } from './GameMenu';
import { HelpDialog } from './HelpDialog';
import { useStore } from './hooks';
import { Hud } from './Hud';
import { Market } from './Market';
import { NeighborsPanel } from './NeighborsPanel';
import { SettingsDialog } from './SettingsDialog';
import { ConfirmDialog, Toasts, TooltipView } from './Popups';
import { TitleScreen } from './TitleScreen';
import { Toolbar } from './Toolbar';
import { TutorialCoach } from './TutorialCoach';

export function App({ gameApp }: { gameApp: GameApp }) {
  const { screen, helpOpen } = useStore(gameApp.store);
  const { uiScale } = useStore(gameApp.settings);
  const session = gameApp.session;

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);

  return (
    <>
      {screen === 'farm' && session ? <FarmUi gameApp={gameApp} session={session} /> : <TitleScreen gameApp={gameApp} />}
      <SettingsDialog gameApp={gameApp} />
      {helpOpen && <HelpDialog onClose={() => gameApp.setHelpOpen(false)} />}
      <WelcomeBack gameApp={gameApp} />
      <AppNotice gameApp={gameApp} />
      <UpdateBanner gameApp={gameApp} />
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
      <InventoryPanel session={session} />
      <FarmerBook session={session} />
      <NeighborsPanel session={session} />
      <ConstructionDialog session={session} />
      <NeighborNews session={session} />
      <Celebration session={session} />
      <TutorialCoach gameApp={gameApp} session={session} />
      <DailyBonus gameApp={gameApp} session={session} />
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
