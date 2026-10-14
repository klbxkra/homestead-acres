import type { Session } from '../app/session';
import { useStore } from './hooks';

const TIP_WIDTH = 220;

export function TooltipView({ session }: { session: Session }) {
  const { tooltip } = useStore(session.ui);
  if (!tooltip) return null;
  const left = Math.max(8, Math.min(tooltip.x + 16, window.innerWidth - TIP_WIDTH - 8));
  const top = Math.max(8, tooltip.y - 76);
  return (
    <div class="tooltip" style={{ left: `${left}px`, top: `${top}px`, maxWidth: `${TIP_WIDTH}px` }} role="status">
      <div class="tooltip-title">{tooltip.title}</div>
      {tooltip.lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

export function Toasts({ session }: { session: Session }) {
  const { toasts } = useStore(session.ui);
  return (
    <div class="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} class={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog({ session }: { session: Session }) {
  const { confirm } = useStore(session.ui);
  if (!confirm) return null;
  const close = () => session.ui.set({ confirm: null });
  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="dialog" role="alertdialog" aria-label={confirm.message} onClick={(e) => e.stopPropagation()}>
        <p>{confirm.message}</p>
        <div class="dialog-buttons">
          <button type="button" class="btn" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              close();
              confirm.onConfirm();
            }}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
