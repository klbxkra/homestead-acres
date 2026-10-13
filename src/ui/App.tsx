import { useEffect, useState } from 'preact/hooks';
import { GAME_TITLE, GAME_VERSION } from '../config';
import { isTouchPrimary, renderPixelRatio, viewportSize } from '../platform/device';

export function App() {
  return (
    <>
      <div class="hud-top">
        <div class="hud-chip hud-title">{GAME_TITLE}</div>
        <div class="hud-chip interactive">🪙 0</div>
        <div class="hud-chip interactive">💵 0</div>
        <div class="hud-chip interactive">⭐ Lv 1</div>
      </div>
      <DebugInfo />
      <div class="rotate-overlay">
        <div class="icon">📱</div>
        <div>Rotate your phone to landscape to play.</div>
      </div>
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
