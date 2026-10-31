import { editLocalAlert, setLocalAlertPaused, type LocalAlert } from './alerts';
import { capturePositionDrawing, samePositionLevels } from './alert-position';
import { isPositionDrawing } from './position-drawing';

export interface PositionFollowResult { alerts: LocalAlert[]; restarted: string[]; diagnostics: string[]; }
/**
 * Live-linked Long/Short levels: when the linked drawing's entry, take profit,
 * stop loss, side or quantity changes, the alert restarts (new revision, entry
 * phase, cleared baselines) with the new levels and keeps its history. Cosmetic
 * changes (color, lock, visibility, text) leave the levels and the alert unchanged.
 * Stopped and expired alerts do not restart; a paused alert stays paused.
 * LV policy: a missing or unreadable drawing keeps the last captured levels.
 * Returns the same array when nothing changes.
 */
export function followPositionDrawings(alerts: LocalAlert[], drawings: readonly unknown[], context: { chartId: string | undefined; instrument: { id: string; symbol: string; currency: string } }, now: number): PositionFollowResult {
  const restarted: string[] = [], diagnostics: string[] = []; let changed = false;
  const byId = new Map<string, unknown>();
  for (const drawing of drawings) if (drawing && typeof drawing === 'object' && isPositionDrawing((drawing as { type?: unknown }).type)) byId.set(String((drawing as { id?: unknown }).id), drawing);
  const next = alerts.map(alert => {
    const { definition } = alert, position = definition.condition.kind === 'position' ? definition.condition.position : undefined;
    if (!position || definition.instrumentId !== context.instrument.id || !['active', 'paused', 'waiting-for-data'].includes(alert.status)) return alert;
    if (definition.observationBinding?.chartId !== undefined && definition.observationBinding.chartId !== context.chartId) return alert;
    if (definition.expiresAt !== null && definition.expiresAt <= now) return alert;
    const drawing = byId.get(position.drawingId);
    if (!drawing) { diagnostics.push(`Linked Long/Short drawing is not on this chart. Alert "${definition.name}" keeps its last captured levels.`); return alert; }
    const captured = capturePositionDrawing(drawing, context.instrument);
    if (!captured.ok) { diagnostics.push(`Linked Long/Short drawing cannot be read (${captured.diagnostics.join(' ')}) Alert "${definition.name}" keeps its last captured levels.`); return alert; }
    if (samePositionLevels(position, captured.position)) return alert;
    try {
      let restartedAlert = editLocalAlert(alert, { condition: { kind: 'position', position: { ...captured.position, drawingId: position.drawingId } } }, now);
      if (alert.status === 'paused') restartedAlert = setLocalAlertPaused(restartedAlert, true);
      changed = true; restarted.push(definition.id); return restartedAlert;
    } catch (error) { diagnostics.push(`Alert "${definition.name}" could not follow its Long/Short levels: ${error instanceof Error ? error.message : String(error)}`); return alert; }
  });
  return { alerts: changed ? next : alerts, restarted, diagnostics };
}
