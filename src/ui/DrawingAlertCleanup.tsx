import React, { useEffect, useRef, useState } from 'react';
import type { LocalAlert } from '../domain/alerts';
import { alertDrawingIds, alertsOfRemovedDrawings, drawingAdditions, drawingRemovals, withoutAlerts, type DrawingLayoutSnapshot, type DrawingRemoval } from '../domain/drawing-alert-links';
import { Modal } from './Modal';

/**
 * When a drawing that has alerts is deleted (any route: Delete key, eraser, context menu, object tree, the
 * drawing manager, Remove drawings, or Undo of its creation), ask whether to delete its alerts too or keep them.
 * Src/domain/drawing-alert-links.ts. The prompt watches the saved layout, so it
 * never fires for a layout switch or a symbol change. Keep (also Escape or Close) leaves the alerts as they are. Delete removes
 * them through the same publisher as the alert list. While another dialog is open the question waits; a second deletion
 * before the answer joins the same question.
 * Undo restores both. Alerts deleted here are kept (for this session, the last 50) with their drawings; when
 * one of those drawings comes back to the same layout (Undo, or Redo of its creation), its alerts return to the list as they
 * were, history included. A drawing that comes back while the question is still open takes its alerts out of the question.
 * Kept alerts need nothing: they read the drawing again once it is back (src/domain/drawing-alert-source.ts).
 */
export const DRAWING_ALERT_STASH_LIMIT = 50;
interface StashedDrawingAlerts { layoutId: string | null; instrumentId: string; drawingIds: string[]; alert: LocalAlert }
/** Alerts of the stash whose drawing came back, and the stash without them. Pure. */
export function restoredDrawingAlerts(stash: readonly StashedDrawingAlerts[], layoutId: string | null, additions: readonly DrawingRemoval[], present: readonly LocalAlert[]): { restore: LocalAlert[]; stash: StashedDrawingAlerts[] } {
  if (!additions.length || !stash.length) return { restore: [], stash: [...stash] };
  const ids = new Set(present.map(alert => alert.definition.id)), restore: LocalAlert[] = [], left: StashedDrawingAlerts[] = [];
  for (const entry of stash) {
    const back = entry.layoutId === layoutId && additions.some(addition => (addition.instrumentId === null || addition.instrumentId === entry.instrumentId) && entry.drawingIds.some(id => addition.ids.includes(id)));
    if (!back) { left.push(entry); continue; }
    if (!ids.has(entry.alert.definition.id)) { restore.push(entry.alert); ids.add(entry.alert.definition.id); }
  }
  return { restore, stash: left };
}
export interface DrawingAlertCleanupProps {
  layoutId: string | null;
  grid: DrawingLayoutSnapshot['grid'];
  alerts: readonly LocalAlert[];
  /** The live saved collection, so a delete is never published against a collection one render old. */
  readAlerts?: () => readonly LocalAlert[];
  enabled: boolean;
  /** Another dialog is open or the workspace is busy: the question waits. */
  held?: boolean;
  onAlertsChange: (alerts: LocalAlert[], expected?: LocalAlert[]) => boolean | void;
  onMessage?: (message: string) => void;
}
export const DRAWING_ALERT_PROMPT_TITLE = 'Delete the drawing\'s alerts?';
export function drawingAlertPromptText(names: readonly string[]): string {
  const quoted = names.slice(0, 3).map(name => `"${name}"`).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '');
  return names.length === 1
    ? `The deleted drawing had an alert, ${quoted}. Delete it too, or keep it in the alert list?`
    : `The deleted drawing had ${names.length} alerts: ${quoted}. Delete them too, or keep them in the alert list?`;
}

export function DrawingAlertCleanup(props: DrawingAlertCleanupProps) {
  const latest = useRef(props); latest.current = props;
  const previous = useRef<DrawingLayoutSnapshot | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const stash = useRef<StashedDrawingAlerts[]>([]);
  useEffect(() => {
    const next: DrawingLayoutSnapshot = { layoutId: props.layoutId, grid: props.grid };
    const before = previous.current; previous.current = props.enabled ? next : null;
    if (!props.enabled || !before) return;
    const additions = drawingAdditions(before, next);
    if (additions.length) {
      const current = [...(latest.current.readAlerts?.() ?? latest.current.alerts)];
      const back = new Set(additions.flatMap(addition => addition.ids));
      setPending(ids => { const left = ids.filter(id => { const alert = current.find(row => row.definition.id === id); return !alert || !alertDrawingIds(alert).some(drawing => back.has(drawing)); }); return left.length === ids.length ? ids : left; });
      const found = restoredDrawingAlerts(stash.current, props.layoutId, additions, current);
      if (found.restore.length) {
        let ok: boolean | void = false;
        try { ok = latest.current.onAlertsChange([...current, ...found.restore], current); } catch (error) { latest.current.onMessage?.(error instanceof Error ? error.message : String(error)); ok = false; }
        if (ok !== false) { stash.current = found.stash; latest.current.onMessage?.(found.restore.length === 1 ? 'Restored 1 alert with its drawing.' : `Restored ${found.restore.length} alerts with their drawings.`); }
        else latest.current.onMessage?.("The drawing's alerts could not be restored. Review the alert list.");
      }
    }
    const found = alertsOfRemovedDrawings(latest.current.readAlerts?.() ?? latest.current.alerts, drawingRemovals(before, next));
    if (found.length) setPending(ids => [...new Set([...ids, ...found.map(alert => alert.definition.id)])]);
  }, [props.grid, props.layoutId, props.enabled]);
  const saved = props.readAlerts?.() ?? props.alerts;
  const shown = saved.filter(alert => pending.includes(alert.definition.id));
  if (!props.enabled || props.held || !shown.length) return null;
  const keep = () => setPending([]);
  const remove = () => {
    const current = [...(latest.current.readAlerts?.() ?? latest.current.alerts)], ids = shown.map(alert => alert.definition.id);
    let ok: boolean | void = false;
    try { ok = latest.current.onAlertsChange(withoutAlerts(current, ids), current); } catch (error) { latest.current.onMessage?.(error instanceof Error ? error.message : String(error)); return; }
    if (ok === false) { latest.current.onMessage?.('The alerts were not deleted. Review the alert list and try again.'); return; }
    stash.current = [...stash.current, ...shown.map(alert => ({ layoutId: latest.current.layoutId, instrumentId: alert.definition.instrumentId, drawingIds: alertDrawingIds(alert), alert: structuredClone(alert) }))].slice(-DRAWING_ALERT_STASH_LIMIT);
    setPending([]);
    latest.current.onMessage?.(ids.length === 1 ? 'Deleted 1 alert.' : `Deleted ${ids.length} alerts.`);
  };
  return <Modal title={DRAWING_ALERT_PROMPT_TITLE} onClose={keep}>
    <p data-lv-drawing-alert-prompt="">{drawingAlertPromptText(shown.map(alert => alert.definition.name))}</p>
    <div className="dialog-actions"><button type="button" autoFocus onClick={keep}>Keep alerts</button><button type="button" data-lv-destructive="true" onClick={remove}>Delete alerts</button></div>
  </Modal>;
}
