import { useCallback, useEffect, useRef } from 'react';

/**
 * Drag-to-dismiss for bottom sheets, the way sheets behave in the
 * apps people already live in: grab the sheet by its handle zone,
 * pull down, and it follows the finger; let go past the threshold
 * (or with a quick downward flick) and it closes, let go short and
 * it springs back.
 *
 * Attach `sheetRef` to the sheet element and spread `handleProps`
 * on the handle/header zone only, never on the scrollable body, so
 * the drag never fights inner scrolling. Buttons inside the handle
 * zone keep working: a press that turns into a drag releases off
 * the button, so no click fires.
 */
export function useSheetDrag(onClose: () => void, threshold = 110) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startY: number;
    dy: number;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const finish = useCallback((dy: number, velocity: number) => {
    const el = sheetRef.current;
    if (!el) return;
    const shouldClose = dy > threshold || (dy > 40 && velocity > 0.45);
    if (shouldClose) {
      el.style.transition = 'transform 200ms ease-in';
      el.style.transform = 'translateY(105%)';
      window.setTimeout(() => closeRef.current(), 170);
    } else {
      el.style.transition = 'transform 240ms cubic-bezier(0.32, 0.72, 0, 1)';
      el.style.transform = 'translateY(0px)';
      window.setTimeout(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transition = '';
          sheetRef.current.style.transform = '';
        }
      }, 250);
    }
  }, [threshold]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragRef.current = {
      startY: e.clientY,
      dy: 0,
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
    };
    const el = sheetRef.current;
    if (el) {
      el.style.transition = 'none';
    }
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const el = sheetRef.current;
      if (!drag || !el) return;
      const now = performance.now();
      const dt = Math.max(1, now - drag.lastT);
      drag.velocity = ((e.clientY - drag.lastY) / dt) * 0.7 + drag.velocity * 0.3;
      drag.lastY = e.clientY;
      drag.lastT = now;
      drag.dy = Math.max(0, e.clientY - drag.startY);
      el.style.transform = `translateY(${drag.dy}px)`;
    };
    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      finish(drag.dy, drag.velocity);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [finish]);

  // The handle zone also needs the classes `touch-none select-none`
  // so the browser hands the gesture to the drag instead of
  // scrolling; each sheet adds them to its own handle markup.
  return { sheetRef, handleProps: { onPointerDown } };
}
