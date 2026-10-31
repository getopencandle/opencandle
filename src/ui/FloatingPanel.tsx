import React, { useEffect, useRef, useState } from 'react';
import { useDialogFocusRetention, useDialogOpener, type DialogFocusFallback } from './Modal';

/**
 * A non-blocking floating panel for the virtual order tickets. Unlike Modal there
 * is no shade and no Tab trap, so the chart under it keeps taking pointer and wheel input (pan, zoom, crosshair, drawing)
 * while a ticket is open. The header drags the panel; it stays inside the window. Escape inside the panel closes it, and
 * focus goes back to the control that opened it when focus is still inside the panel or lost. Wording is OpenCandle's own.
 */
export interface FloatingPoint { x: number; y: number }
/** Keeps at least `grip` px of the header inside the window so the panel can always be dragged back. */
export function clampFloatingPosition(point: FloatingPoint, size: { width: number; height: number }, viewport: { width: number; height: number }, grip = 48): FloatingPoint {
  const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
  const width = Math.max(0, finite(size.width, 0)), maxX = Math.max(0, finite(viewport.width, 0) - Math.min(width, grip)), minX = Math.min(0, grip - width);
  const maxY = Math.max(0, finite(viewport.height, 0) - grip);
  return { x: Math.round(Math.min(Math.max(finite(point.x, 0), minX), maxX)), y: Math.round(Math.min(Math.max(finite(point.y, 0), 0), maxY)) };
}
/** Default spot: right side of the window, below the header bar, `width` px wide. */
export function defaultFloatingPosition(width: number, viewport: { width: number; height: number }): FloatingPoint {
  return clampFloatingPosition({ x: viewport.width - width - 72, y: 104 }, { width, height: 0 }, viewport);
}
export const FLOATING_PANEL_WIDTH = 520;

/** `initialAt` opens the panel at a saved spot (clamped to the window, so a saved point from a larger
 * window stays reachable); `onMove` reports the final spot once per drag, at pointer up, so the owner can save it. */
export function FloatingPanel({ title, onClose, children, width = FLOATING_PANEL_WIDTH, focusFallback, initialAt, onMove }: { title: string; onClose: () => void; children: React.ReactNode; width?: number; focusFallback?: DialogFocusFallback; initialAt?: FloatingPoint; onMove?: (point: FloatingPoint) => void }) {
  const ref = useRef<HTMLDivElement>(null), opener = useDialogOpener();
  const viewport = () => typeof window === 'undefined' ? { width: 1280, height: 800 } : { width: window.innerWidth, height: window.innerHeight };
  const [at, setAt] = useState<FloatingPoint>(() => initialAt && Number.isFinite(initialAt.x) && Number.isFinite(initialAt.y) ? clampFloatingPosition(initialAt, { width, height: 0 }, viewport()) : defaultFloatingPosition(width, viewport()));
  const moved = useRef(onMove); moved.current = onMove;
  useEffect(() => {
    const previous = opener, panel = ref.current;
    if (!panel?.contains(document.activeElement)) panel?.querySelector<HTMLElement>('input,button,select,textarea')?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected && !panel?.contains(previous) && (document.activeElement === document.body || !document.activeElement || panel?.contains(document.activeElement))) previous.focus(); };
  }, []);
  useDialogFocusRetention(ref, true, focusFallback);
  const drag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest?.('button')) return;
    event.preventDefault();
    const target = event.currentTarget, start = { x: event.clientX, y: event.clientY }, origin = at, box = ref.current?.getBoundingClientRect?.();
    const size = { width: box?.width ?? width, height: box?.height ?? 0 };
    try { target.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
    let last: FloatingPoint | null = null;
    const move = (next: PointerEvent) => { last = clampFloatingPosition({ x: origin.x + next.clientX - start.x, y: origin.y + next.clientY - start.y }, size, viewport()); setAt(last); };
    const end = () => { if (last && (last.x !== origin.x || last.y !== origin.y)) moved.current?.(last); target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  };
  return (
    <div ref={ref} className="lv-modal lv-floating-panel" role="dialog" aria-modal="false" aria-label={title} tabIndex={-1} data-lv-floating="true"
      style={{ position: 'fixed', left: at.x, top: at.y, width: `min(${width}px,94vw)`, maxHeight: 'calc(100vh - 120px)', zIndex: 900, resize: 'both', overflow: 'auto' }}
      onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <header onPointerDown={drag} style={{ cursor: 'move', padding: '8px 12px', position: 'sticky', top: 0, background: 'var(--lv-bg-raised)', zIndex: 1 }} title="Drag to move this panel. The chart stays usable while it is open.">
        <h2 style={{ fontSize: 15 }}>{title}</h2>
        <button type="button" aria-label={'Close ' + title} data-lv-destructive="true" onClick={onClose}>×</button>
      </header>
      {children}
    </div>
  );
}
