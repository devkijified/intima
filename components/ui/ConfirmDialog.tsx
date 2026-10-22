'use client';

import { useEffect } from 'react';

/**
 * The house confirm dialog. System dialogs (window.confirm) look
 * foreign and block the whole page; this one matches the app:
 * a soft scrim, a warm card, one burgundy confirm action. Render
 * it when `open` and wire onCancel/onConfirm; Escape and the
 * scrim both cancel.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center p-4 sm:items-center" role="alertdialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label={cancelLabel}
        className="absolute inset-0 h-full w-full bg-black/45"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm rounded-[26px] bg-white p-6 shadow-2xl animate-rise-in">
        <h2 className="t-section-title text-charcoal">{title}</h2>
        {body && <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{body}</p>}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-soft min-h-[48px] flex-1 px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="btn-luxe min-h-[48px] flex-1 px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
