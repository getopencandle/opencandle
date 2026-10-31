import { describe, expect, it } from 'vitest';
import { createLocalAlert, editLocalAlert, LOCAL_ALERT_NOTICE, processAlertEvent, restoreLocalAlerts, setLocalAlertPaused, validateLocalAlerts } from '../../src/domain/alerts';
import type { AlertDefinition, AlertEvent, LocalAlert } from '../../src/domain/alerts';

const definition = (changes: Partial<AlertDefinition> = {}): AlertDefinition => ({ id: 'test', instrumentId: 'SYNTHETIC:GME', sourceId: 'close', name: 'Synthetic alert', message: 'Local virtual test', condition: { kind: 'crossing-up', value: 10 }, frequency: 'every-time', createdAt: 0, expiresAt: null, mode: 'ordinary', runId: 'ordinary', ...changes });
const event = (value: number | null, sequence: number, changes: Partial<AlertEvent> = {}): AlertEvent => ({ instrumentId: 'SYNTHETIC:GME', sourceId: 'close', value, time: sequence, availableAt: sequence, sequence, barId: `bar-${sequence}`, barClosed: true, feedState: 'ready', mode: 'ordinary', runId: 'ordinary', ...changes });
const consume = (alert: LocalAlert, value: number, sequence: number, changes = {}) => processAlertEvent(alert, event(value, sequence, changes));

describe('local alert conditions and frequency', () => {
  it('triggers strict crossings using only accepted prior information', () => {
    let alert = createLocalAlert(definition());
    alert = consume(alert, 9, 1).alert; expect(consume(alert, 10, 2).notification).toBeNull();
    alert = consume(alert, 10, 2).alert;
    const crossed = consume(alert, 11, 3); expect(crossed.notification?.value).toBe(11); expect(crossed.alert.history).toHaveLength(1);
    expect(consume(crossed.alert, 12, 4).notification).toBeNull();
    expect(LOCAL_ALERT_NOTICE).toContain('sleep');
  });
  it('limits once-per-bar and once-only alerts without suppressing later eligible bars', () => {
    let alert = createLocalAlert(definition({ condition: { kind: 'greater', value: 10 }, frequency: 'once-per-bar' }));
    alert = consume(alert, 11, 1, { barId: 'same', barClosed: false }).alert;
    expect(consume(alert, 12, 2, { barId: 'same', barClosed: false }).notification).toBeNull();
    expect(consume(alert, 12, 2, { barId: 'next' }).notification).not.toBeNull();
    let once = createLocalAlert(definition({ condition: { kind: 'greater', value: 10 }, frequency: 'only-once' }));
    once = consume(once, 11, 1).alert; expect(once.status).toBe('stopped'); expect(consume(once, 12, 2).notification).toBeNull();
  });
  it('compares completed-bar baselines even if an intrabar update already crossed', () => {
    let alert = createLocalAlert(definition({ frequency: 'once-per-bar-close' }));
    alert = consume(alert, 9, 1, { barId: 'prior' }).alert;
    alert = consume(alert, 11, 2, { barId: 'current', barClosed: false }).alert;
    expect(alert.history).toHaveLength(0);
    const closed = consume(alert, 12, 3, { barId: 'current', barClosed: true });
    expect(closed.notification?.value).toBe(12);
    expect(consume(closed.alert, 13, 4, { barId: 'current' }).notification).toBeNull();
  });
  it('uses rolling minute frequency and inclusive channel bounds', () => {
    let alert = createLocalAlert(definition({ condition: { kind: 'inside', lower: 10, upper: 20 }, frequency: 'once-per-minute' }));
    alert = consume(alert, 10, 1).alert;
    expect(consume(alert, 20, 60).notification).toBeNull(); expect(consume(alert, 20, 61).notification).not.toBeNull();
    let channel = createLocalAlert(definition({ condition: { kind: 'entering', lower: 10, upper: 20 } }));
    channel = consume(channel, 9, 1).alert; expect(consume(channel, 10, 2).notification).not.toBeNull();
    const outside = createLocalAlert(definition({ condition: { kind: 'outside', lower: 10, upper: 20 } })); expect(consume(outside, 20, 1).notification).toBeNull(); expect(consume(outside, 21, 1).notification).not.toBeNull();
  });
  it('measures movement against completed historical bars', () => {
    let alert = createLocalAlert(definition({ condition: { kind: 'moving-up', amount: 20, percent: true, bars: 2 } }));
    alert = consume(alert, 10, 1).alert; alert = consume(alert, 11, 2).alert;
    expect(consume(alert, 12, 3).notification).not.toBeNull();
    const firstClose = consume(alert, 12, 3, { barId: 'current' }).alert;
    expect(consume(firstClose, 12, 4, { barId: 'current' }).notification).not.toBeNull();
    expect(() => createLocalAlert(definition({ condition: { kind: 'inside', lower: 20, upper: 10 } }))).toThrow();
    expect(() => createLocalAlert(definition({ condition: { kind: 'moving-up', amount: -1, bars: 0 } }))).toThrow();
  });
});

describe('alert lifecycle, gaps and run isolation', () => {
  it('expires before evaluating a would-be trigger', () => {
    let alert = createLocalAlert(definition({ expiresAt: 3 })); alert = consume(alert, 9, 1).alert;
    const result = consume(alert, 11, 3); expect(result.alert.status).toBe('expired'); expect(result.notification).toBeNull();
    expect(consume(setLocalAlertPaused(alert, true), 11, 3).alert.status).toBe('expired');
  });
  it('does not invent crossings across disconnected periods or sleep gaps', () => {
    let alert = createLocalAlert(definition({ maxGapSeconds: 10 })); alert = consume(alert, 9, 1).alert;
    const gap = consume(alert, 11, 20); expect(gap.notification).toBeNull(); expect(gap.alert.missedDataGaps).toBe(1);
    alert = consume(gap.alert, 9, 21).alert;
    alert = processAlertEvent(alert, event(null, 22, { feedState: 'disconnected' })).alert;
    expect(alert.status).toBe('waiting-for-data'); expect(consume(alert, 11, 23).notification).toBeNull();
    alert = consume(alert, 9, 23).alert; expect(consume(alert, 11, 24).notification).not.toBeNull();
  });
  it('pause/resume and editing clear numerical baselines and preserve real trigger history', () => {
    let alert = createLocalAlert(definition()); alert = consume(alert, 9, 1).alert; alert = consume(alert, 11, 2).alert;
    const paused = setLocalAlertPaused(alert, true); expect(consume(paused, 9, 3).alert).toBe(paused);
    const resumed = setLocalAlertPaused(paused, false); expect(consume(resumed, 11, 3).notification).toBeNull();
    const edited = editLocalAlert(alert, { condition: { kind: 'greater', value: 20 } }, 3);
    expect(edited.history).toHaveLength(1); expect(edited.lastValue).toBeNull(); expect(consume(edited, 21, 4).notification).not.toBeNull();
    const sameTimeEdit = editLocalAlert(alert, { condition: { kind: 'greater', value: 10 } }, 2);
    expect(consume(sameTimeEdit, 11, 2).notification).toBeNull(); expect(sameTimeEdit.revision).toBe(2);
  });
  it('rejects duplicate/out-of-order/future events and keeps ordinary/replay state separate', () => {
    let alert = createLocalAlert(definition()); alert = consume(alert, 9, 1).alert;
    for (const ev of [event(11, 1), event(11, 0), event(11, 2, { availableAt: 3 }), event(11, 2, { mode: 'replay', runId: 'replay:1' })]) {
      const result = processAlertEvent(alert, ev); expect(result.alert).toBe(alert); expect(result.notification).toBeNull(); expect(result.diagnostics.length).toBeGreaterThan(0);
    }
    expect(processAlertEvent(alert, event(11, 2, { instrumentId: 'SYNTHETIC:SPY' })).alert).toBe(alert);
  });
  it('snapshots conditions and never mutates caller definitions', () => {
    const settings = definition(), alert = createLocalAlert(settings); settings.condition.value = 1000;
    expect(alert.definition.condition.value).toBe(10);
    const result = consume(alert, 9, 1); expect(alert.lastValue).toBeNull(); expect(result.alert.lastValue).toBe(9);
  });
  it('rejects reused completed bar identities after advancing to a new bar', () => {
    let alert = createLocalAlert(definition()); alert = consume(alert, 9, 1, { barId: 'old' }).alert; alert = consume(alert, 9, 2, { barId: 'current' }).alert;
    const result = consume(alert, 11, 3, { barId: 'old' }); expect(result.alert).toBe(alert); expect(result.notification).toBeNull(); expect(result.diagnostics[0]).toContain('previously completed');
  });
  it('round trips local alerts and rejects corrupted histories or unsafe objects', () => {
    let alert = createLocalAlert(definition()); alert = consume(alert, 9, 1).alert; alert = consume(alert, 11, 2).alert;
    const edited = editLocalAlert(alert, { name: 'Edited' }, 3), valid = JSON.parse(JSON.stringify([edited]));
    expect(validateLocalAlerts(valid).errors).toEqual([]); expect(restoreLocalAlerts(valid)).toEqual([edited]);
    for (const mutate of [(copy: LocalAlert) => { copy.history[0].runId = 'other'; }, (copy: LocalAlert) => { copy.history.push(copy.history[0]); }, (copy: LocalAlert) => { copy.closedBars.push({ id: 'bad', value: NaN }); }, (copy: LocalAlert) => { copy.lastSequence = 1; }, (copy: LocalAlert) => { copy.revision = 0; }]) { const copy = structuredClone(edited); mutate(copy); expect(validateLocalAlerts([copy]).ok).toBe(false); }
    expect(validateLocalAlerts([alert, alert]).ok).toBe(false); expect(validateLocalAlerts(null).ok).toBe(false); expect(validateLocalAlerts(JSON.parse('[{"__proto__":{"x":1}}]')).ok).toBe(false);
  });
});
