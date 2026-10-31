// Display names omit internal ids; source identities and lifecycle assertions stay intact.
import { expect, it } from 'vitest';
import { deserializeDrawing, type SerializedDrawing } from '@luxalgo/vela';
import { capturePositionDrawing, evaluatePositionStep, positionAlertMessage, positionAlertSummary, samePositionLevels, validateAlertPosition, type AlertPositionLevels } from '../../src/domain/alert-position';
import { followPositionDrawings } from '../../src/domain/alert-position-follow';
import { cloneLocalAlert, createLocalAlert, processAlertEvent, restoreLocalAlerts, setLocalAlertPaused, validateLocalAlerts, type AlertDefinition, type AlertEvent, type LocalAlert } from '../../src/domain/alerts';

// SYNTHETIC Long/Short fixtures with literal oracles. Model checks only; no GUI.
const instrument = { id: 'SYNTHETIC:GME', symbol: 'GME', currency: 'USD' };
const drawing = (id: string, entry: number, stop: number, target: number, props: Record<string, unknown> = { riskPercent: 1, accountBalance: 10000 }, extra: Record<string, unknown> = {}) => ({ id, type: 'position', paneId: 'price', anchors: [{ time: 1_700_000_000_000, price: entry }, { time: 1_700_086_400_000, price: stop }, { time: 1_700_086_400_000, price: target }], style: { lineColor: '#123456', lineWidth: 1, lineStyle: 'solid' }, locked: false, visible: true, zIndex: 0, createdAt: 1, props, ...extra });
const long: AlertPositionLevels = { schemaVersion: 1, drawingId: 'p1', side: 'long', entry: 100, target: 110, stop: 95, quantity: 20, ticker: 'GME', currency: 'USD' };
const short: AlertPositionLevels = { schemaVersion: 1, drawingId: 'p2', side: 'short', entry: 100, target: 92, stop: 104, quantity: 25, ticker: 'GME', currency: 'USD' };

it('captures a placed Long/Short drawing as entry, stop, target and the drawing\'s own quantity', () => {
  const longCapture = capturePositionDrawing(drawing('p1', 100, 95, 110), instrument);
  expect(longCapture).toEqual({ ok: true, position: long });
  const shortCapture = capturePositionDrawing(drawing('p2', 100, 104, 92), instrument);
  expect(shortCapture).toEqual({ ok: true, position: short });
  // Independent oracle: the actual Vela Long/Short model reports the same side and size.
  for (const [record, captured] of [[drawing('p1', 100, 95, 110), longCapture], [drawing('p2', 100, 104, 92), shortCapture], [drawing('p3', 50.5, 49.25, 54, { riskPercent: 2.5, accountBalance: 3000 }), capturePositionDrawing(drawing('p3', 50.5, 49.25, 54, { riskPercent: 2.5, accountBalance: 3000 }), instrument)]] as const) {
    const model = deserializeDrawing(record as unknown as SerializedDrawing) as unknown as { quantity: number; direction: string; entryPrice: number; stopPrice: number; targetPrice: number };
    if (!captured.ok) throw new Error(captured.diagnostics.join(' '));
    expect(captured.position.quantity).toBeCloseTo(model.quantity, 10); expect(captured.position.side).toBe(model.direction);
    expect([captured.position.entry, captured.position.stop, captured.position.target]).toEqual([model.entryPrice, model.stopPrice, model.targetPrice]);
  }
  expect(capturePositionDrawing(drawing('p3', 50.5, 49.25, 54, { riskPercent: 2.5, accountBalance: 3000 }), instrument)).toMatchObject({ ok: true, position: { quantity: 60 } });
  for (const [bad, message] of [
    [{ ...drawing('x', 100, 95, 110), anchors: drawing('x', 100, 95, 110).anchors.slice(0, 2) }, 'Finish placing'],
    [{ ...drawing('x', 100, 95, 110), paneId: 'pane-2' }, 'main price pane'],
    [drawing('x', 100, 95, 110, {}), 'quantity is unknown'],
    [drawing('x', 100, 101, 110), 'opposite sides'],
    [{ ...drawing('x', 100, 95, 110), type: 'trendline' }, 'not a Long/Short position'],
    [drawing('x', 100, 95, Number.NaN), 'finite prices'],
  ] as const) { const result = capturePositionDrawing(bad, instrument); expect(result.ok).toBe(false); if (!result.ok) expect(result.diagnostics.join(' ')).toContain(message); }
  expect(() => validateAlertPosition({ ...long, extra: 1 })).toThrow(/unsupported fields/);
  expect(() => validateAlertPosition({ ...long, quantity: -1 })).toThrow(/nonnegative quantity/);
  expect(() => validateAlertPosition({ ...short, side: 'long' })).toThrow(/opposite sides/);
  expect(samePositionLevels(long, { ...long, drawingId: 'other', ticker: 'X' })).toBe(true);
  expect(samePositionLevels(long, { ...long, target: 111 })).toBe(false);
});

it('steps entry once, then the first take profit or stop loss once, with explicit initial and same-observation policies', () => {
  expect(evaluatePositionStep(long, 'waiting-entry', null, 97)).toEqual({ phase: 'waiting-entry', level: null, diagnostic: null });
  expect(evaluatePositionStep(long, 'waiting-entry', 97, 99.99).level).toBeNull();
  expect(evaluatePositionStep(long, 'waiting-entry', 97, 100)).toEqual({ phase: 'entered', level: 'entry', diagnostic: null });
  expect(evaluatePositionStep(long, 'waiting-entry', 103, 100).level).toBe('entry');
  expect(evaluatePositionStep(long, 'entered', 100, 109.99).level).toBeNull();
  expect(evaluatePositionStep(long, 'entered', 100, 110)).toEqual({ phase: 'exited', level: 'target', diagnostic: null });
  expect(evaluatePositionStep(long, 'entered', 100, 95)).toEqual({ phase: 'exited', level: 'stop', diagnostic: null });
  expect(evaluatePositionStep(long, 'exited', 95, 120)).toEqual({ phase: 'exited', level: null, diagnostic: null });
  expect(evaluatePositionStep(short, 'entered', 100, 92).level).toBe('target');
  expect(evaluatePositionStep(short, 'entered', 100, 104).level).toBe('stop');
  // Initial observation between entry and take profit: entry already passed, exits monitored.
  expect(evaluatePositionStep(long, 'waiting-entry', null, 103)).toMatchObject({ phase: 'entered', level: null });
  expect(evaluatePositionStep(short, 'waiting-entry', null, 96)).toMatchObject({ phase: 'entered', level: null });
  expect(evaluatePositionStep(long, 'waiting-entry', null, 100)).toEqual({ phase: 'waiting-entry', level: null, diagnostic: null });
  // LV policy: initial beyond a level waits for an entry crossing, with a visible diagnostic.
  expect(evaluatePositionStep(long, 'waiting-entry', null, 111).diagnostic).toContain('waits for price to cross the entry');
  expect(evaluatePositionStep(short, 'waiting-entry', null, 105)).toMatchObject({ phase: 'waiting-entry', level: null });
  // LV policy: one observation reports at most one level, entry first.
  expect(evaluatePositionStep(long, 'waiting-entry', 97, 111)).toEqual({ phase: 'entered', level: 'entry', diagnostic: null });
  expect(positionAlertSummary(long, 'target', 110.5)).toBe('GME Long position: Take profit 110 reached at 110.5. Quantity 20. PnL +210.00 USD.');
  expect(positionAlertSummary(short, 'stop', 104.2)).toBe('GME Short position: Stop loss 104 reached at 104.2. Quantity 25. PnL -105.00 USD.');
  expect(positionAlertSummary(long, 'entry', 100)).toBe('GME Long position: Entry 100 reached at 100. Quantity 20. PnL 0.00 USD.');
  expect(positionAlertMessage('  Check the plan  ', long, 'entry', 100)).toBe('Check the plan\nGME Long position: Entry 100 reached at 100. Quantity 20. PnL 0.00 USD.');
});

const definition = (position: AlertPositionLevels, extra: Partial<AlertDefinition> = {}): AlertDefinition => ({ id: `alert-${position.drawingId}`, instrumentId: 'SYNTHETIC:GME', sourceId: 'close', name: `SYNTHETIC ${position.side} position`, message: 'SYNTHETIC plan', condition: { kind: 'position', position }, frequency: 'every-time', createdAt: 100, expiresAt: null, mode: 'ordinary', runId: 'ordinary', ...extra });
const event = (sequence: number, value: number, extra: Partial<AlertEvent> = {}): AlertEvent => ({ instrumentId: 'SYNTHETIC:GME', sourceId: 'close', value, time: 100 + sequence, availableAt: 100 + sequence, sequence, barId: `SYNTHETIC ${sequence}`, barClosed: false, feedState: 'ready', mode: 'ordinary', runId: 'ordinary', ...extra });
function run(alert: LocalAlert, values: Array<number | ['gap', number]>, start = 1) { const notes: string[] = []; values.forEach((value, index) => { const result = Array.isArray(value) ? processAlertEvent(alert, event(start + index, value[1], { feedState: 'stale', value: null })) : processAlertEvent(alert, event(start + index, value)); alert = result.alert; notes.push(...result.diagnostics); }); return { alert, notes }; }

it('records entry once and stays active, then stops after the first take profit; persisted state validates', () => {
  const created = createLocalAlert(definition(long));
  expect(created.positionPhase).toBe('waiting-entry');
  const { alert } = run(created, [97, 100, 101, 100.5, 109, 110.5, 120, 90]);
  expect(alert.history.map(item => [item.positionLevel, item.value, item.message])).toEqual([
    ['entry', 100, 'SYNTHETIC plan\nGME Long position: Entry 100 reached at 100. Quantity 20. PnL 0.00 USD.'],
    ['target', 110.5, 'SYNTHETIC plan\nGME Long position: Take profit 110 reached at 110.5. Quantity 20. PnL +210.00 USD.'],
  ]);
  expect(alert.status).toBe('stopped'); expect(alert.positionPhase).toBe('exited');
  expect(restoreLocalAlerts(JSON.parse(JSON.stringify([alert])))[0]).toEqual(alert);
  const forged = JSON.parse(JSON.stringify([alert])); forged[0].positionPhase = 'triggered';
  expect(validateLocalAlerts(forged).ok).toBe(false);
  const missing = JSON.parse(JSON.stringify([alert])); delete missing[0].positionPhase;
  expect(validateLocalAlerts(missing).ok).toBe(false);
  const plain = createLocalAlert({ ...definition(long), id: 'plain', condition: { kind: 'greater', value: 1 } });
  const borrowed = JSON.parse(JSON.stringify([{ ...plain, positionPhase: 'entered' }]));
  expect(validateLocalAlerts(borrowed).ok).toBe(false);
});

it('keeps a single price condition, survives gaps, pause/resume and clone with explicit phase rules', () => {
  expect(() => createLocalAlert(definition(long, { frequency: 'only-once' }))).toThrow(/frequency must be every eligible update/);
  expect(() => createLocalAlert(definition(long, { sourceId: 'indicator:sma' }))).toThrow(/one price condition/);
  expect(() => createLocalAlert({ ...definition(long), condition: { kind: 'greater', value: 1, position: long } })).toThrow(/belong only to a position alert/);
  expect(() => createLocalAlert({ ...definition(long), condition: { kind: 'position' } })).toThrow(/plain object/);
  // Short stop loss after entry, across an unusable-data gap (phase is retained).
  const shortRun = run(createLocalAlert(definition(short)), [101, 100, ['gap', 0], 103, 104.2]);
  expect(shortRun.alert.history.map(item => item.positionLevel)).toEqual(['entry', 'stop']);
  expect(shortRun.alert.history[1].message).toContain('PnL -105.00 USD.');
  // Initial already passed: no entry notification, then the stop.
  const passed = run(createLocalAlert(definition(long)), [103, 94]);
  expect(passed.alert.history.map(item => item.positionLevel)).toEqual(['stop']);
  expect(passed.notes).toContain('Entry was already passed when monitoring began. Take profit and stop loss are monitored without an entry notification.');
  // Pause keeps the phase; resume continues exit monitoring.
  const entered = run(createLocalAlert(definition(long)), [97, 100]).alert;
  const resumed = setLocalAlertPaused(setLocalAlertPaused(entered, true), false);
  expect(resumed.positionPhase).toBe('entered');
  expect(run(resumed, [111], 3).alert.history.map(item => item.positionLevel)).toEqual(['entry', 'target']);
  // A clone starts a fresh entry phase with no copied history.
  const copy = cloneLocalAlert(entered, 'copy', 200);
  expect(copy.positionPhase).toBe('waiting-entry'); expect(copy.history).toEqual([]); expect(copy.definition.condition.position).toEqual(long);
});

it('follows moved drawing levels by restarting with history kept, ignores cosmetic edits and keeps last levels for a missing drawing', () => {
  const entered = run(createLocalAlert(definition(long)), [97, 100]).alert;
  const paused = setLocalAlertPaused(run(createLocalAlert(definition(short)), [101]).alert, true);
  const stopped = { ...run(createLocalAlert({ ...definition({ ...long, drawingId: 'p9' }), id: 'done' }), [97, 100, 111]).alert };
  expect(stopped.status).toBe('stopped');
  const alerts = [entered, paused, stopped];
  const context = { chartId: undefined, instrument };
  // Cosmetic-only changes: color, lock, visibility.
  const cosmetic = [drawing('p1', 100, 95, 110, undefined, { style: { lineColor: '#ff0000' }, locked: true, visible: false }), drawing('p2', 100, 104, 92), drawing('p9', 100, 95, 112)];
  const unchanged = followPositionDrawings(alerts, cosmetic, context, 300);
  expect(unchanged.alerts).toBe(alerts); expect(unchanged.restarted).toEqual([]);
  // Moved target on p1 and moved entry on p2.
  const moved = followPositionDrawings(alerts, [drawing('p1', 100, 95, 112), drawing('p2', 99, 104, 92), drawing('p9', 100, 95, 112)], context, 300);
  expect(moved.restarted).toEqual(['alert-p1', 'alert-p2']);
  const [first, second, third] = moved.alerts;
  expect(first.definition.condition.position).toEqual({ ...long, target: 112 });
  expect(first.revision).toBe(2); expect(first.positionPhase).toBe('waiting-entry'); expect(first.status).toBe('active'); expect(first.armedAt).toBe(300);
  expect(first.history).toEqual(entered.history);
  expect(second.status).toBe('paused'); expect(second.definition.condition.position).toMatchObject({ entry: 99, quantity: 20 });
  expect(third).toBe(stopped);
  expect(validateLocalAlerts(moved.alerts).ok).toBe(true);
  const missing = followPositionDrawings(alerts, [], context, 300);
  expect(missing.alerts).toBe(alerts);
  expect(missing.diagnostics).toEqual(['Linked Long/Short drawing is not on this chart. Alert "SYNTHETIC long position" keeps its last captured levels.', 'Linked Long/Short drawing is not on this chart. Alert "SYNTHETIC short position" keeps its last captured levels.']);
  const otherInstrument = followPositionDrawings(alerts, [drawing('p1', 100, 95, 112)], { chartId: undefined, instrument: { id: 'SYNTHETIC:AMC', symbol: 'AMC', currency: 'USD' } }, 300);
  expect(otherInstrument.alerts).toBe(alerts);
});
