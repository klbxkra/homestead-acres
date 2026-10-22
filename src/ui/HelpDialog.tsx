/** "How to play": controls for mouse and touch, and the basics (PLAN.md Phase 7 "tooltips"). */
import { useEffect } from 'preact/hooks';

const CONTROLS: readonly [string, string, string][] = [
  ['Use a tool', 'Tap', 'Click'],
  ['Move around', 'Drag with one finger', 'Drag, or WASD / arrow keys'],
  ['Zoom', 'Pinch', 'Mouse wheel, or + and −'],
  ['See what something is', 'Press and hold', 'Hover'],
  ['Work many plots', 'Paint 🖌️, then drag across them', 'Paint 🖌️, or hold Shift and drag'],
  ['Cancel / go home', 'Cancel ✖ or Home 🏠', 'Esc or right-click'],
  ['Rotate a held item', 'Rotate 🔄', 'R'],
];

const KEYS: readonly [string, string][] = [
  ['1–4', 'Multi-tool, Plow, Seeds, Harvest'],
  ['5–7', 'Move, Sell, Store'],
  ['8', 'Drive a vehicle'],
  ['M / I / B / N', 'Market, Gift box, Farmer’s Book, Neighbors'],
  ['P', 'Paint mode'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="modal-backdrop interactive" onClick={onClose}>
      <div class="dialog help" role="dialog" aria-label="How to play" onClick={(e) => e.stopPropagation()}>
        <h2>How to play</h2>
        <ol class="help-loop">
          <li>
            <b>Plow, plant, harvest.</b> The ✋ Multi-tool does the right thing on each plot: plows grass, plants your chosen seed, harvests ripe crops.
            Your farmer walks to each job (Settings → Instant actions skips the walk).
          </li>
          <li>
            <b>Don't let crops wither.</b> Ripe crops wait for a while, then wither. Hover or press and hold to see the timer.
          </li>
          <li>
            <b>Grow your farm.</b> Levels unlock crops, trees, animals and buildings. Animals and trees produce on their own; buildings hold them.
          </li>
          <li>
            <b>Neighbors.</b> Visit them to help (coins, gifts), accept their gifts in the mailbox, and take on co-op jobs together.
          </li>
          <li>
            <b>Your rules.</b> Settings → World rules changes game speed, withering, prices and more, per farm.
          </li>
        </ol>
        <table class="help-table">
          <thead>
            <tr>
              <th />
              <th>Touch</th>
              <th>Mouse &amp; keyboard</th>
            </tr>
          </thead>
          <tbody>
            {CONTROLS.map(([what, touch, mouse]) => (
              <tr key={what}>
                <th scope="row">{what}</th>
                <td>{touch}</td>
                <td>{mouse}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Shortcut keys</h3>
        <ul class="help-keys">
          {KEYS.map(([k, what]) => (
            <li key={k}>
              <kbd>{k}</kbd> {what}
            </li>
          ))}
        </ul>
        <div class="dialog-buttons">
          <button type="button" class="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
