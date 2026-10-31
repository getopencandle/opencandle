import { describe, expect, it } from 'vitest';
import { captureFibActiveLevels, describeAlertLevels, validateAlertLevels, crossedAlertLevel, type AlertLevelSet } from '../../src/domain/alert-levels';
import { createLocalAlert, processAlertEvent, restoreLocalAlerts, type AlertDefinition, type AlertEvent, type LocalAlert } from '../../src/domain/alerts';

// SYNTHETIC drawings and prices only. Level prices follow the renderer's Fib retracement rule:
// reverse ? p1 + r * (p2 - p1) : p2 + r * (p1 - p2), with a missing reverse flag read as true.
const fib = (props: Record<string, unknown>, anchors = [{ time: 1_700_000_000_000, price: 100 }, { time: 1_700_086_400_000, price: 200 }]) => ({ id: 'fib-1', type: 'fibretracement', paneId: 'price', anchors, style: { lineColor: '#808080', lineWidth: 1, lineStyle: 'solid' }, props });
const levels = [{ ratio: 0, color: '#808080', enabled: true }, { ratio: 0.5, color: '#4caf50', enabled: true }, { ratio: 1, color: '#808080', enabled: true }, { ratio: -0.5, color: '#F23645', enabled: false }, { ratio: 1.618, color: '#2962FF', enabled: true }];

describe('captureFibActiveLevels', () => {
  it('captures only the enabled levels at the renderer prices, sorted by price (reverse false)', () => {
    const captured = captureFibActiveLevels(fib({ levels, reverse: false }));
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    // p1=100, p2=200, not reversed: price = 200 + r * (100 - 200)
    expect(captured.levels.levels).toEqual([{ ratio: 1.618, price: 38.2 }, { ratio: 1, price: 100 }, { ratio: 0.5, price: 150 }, { ratio: 0, price: 200 }]);
    expect(captured.levels).toMatchObject({ schemaVersion: 1, drawingId: 'fib-1', tool: 'fibretracement' });
  });
  it('reads a missing reverse flag as reversed, as the renderer does', () => {
    const captured = captureFibActiveLevels(fib({ levels }));
    if (!captured.ok) throw Error(captured.diagnostics.join(' '));
    // reversed: price = 100 + r * (200 - 100)
    expect(captured.levels.levels.map(row => row.price)).toEqual([100, 150, 200, 261.8]);
  });
  it('refuses drawings that are not a finished Fib retracement on the price pane, or have no enabled level', () => {
    expect(captureFibActiveLevels({ ...fib({ levels }), type: 'trendline' }).ok).toBe(false);
    expect(captureFibActiveLevels({ ...fib({ levels }), paneId: 'pane-2' }).ok).toBe(false);
    expect(captureFibActiveLevels(fib({ levels }, [{ time: 1, price: 100 }])).ok).toBe(false);
    expect(captureFibActiveLevels(fib({ levels: levels.map(row => ({ ...row, enabled: false })) })).ok).toBe(false);
    expect(captureFibActiveLevels(fib({})).ok).toBe(false);
    expect(captureFibActiveLevels(fib({ levels }, [{ time: 1, price: 100 }, { time: 2, price: Number.NaN }])).ok).toBe(false);
  });
  it('merges levels that land on the same price', () => {
    const captured = captureFibActiveLevels(fib({ levels, reverse: false }, [{ time: 1, price: 100 }, { time: 2, price: 100 }]));
    if (!captured.ok) throw Error(captured.diagnostics.join(' '));
    expect(captured.levels.levels).toEqual([{ ratio: 0, price: 100 }]);
  });
  it('describes the captured levels in plain words', () => {
    const captured = captureFibActiveLevels(fib({ levels, reverse: false }));
    if (!captured.ok) throw Error('capture');
    expect(describeAlertLevels(captured.levels)).toBe('4 active levels: 38.2, 100, 150, 200');
  });
  it('validates saved level sets strictly', () => {
    const good: AlertLevelSet = { schemaVersion: 1, drawingId: 'f', tool: 'fibretracement', levels: [{ ratio: 0, price: 1 }, { ratio: 1, price: 2 }] };
    expect(() => validateAlertLevels(good)).not.toThrow();
    expect(() => validateAlertLevels({ ...good, levels: [] })).toThrow();
    expect(() => validateAlertLevels({ ...good, levels: [{ ratio: 0, price: 2 }, { ratio: 1, price: 1 }] })).toThrow();
    expect(() => validateAlertLevels({ ...good, levels: [{ ratio: 0, price: 1 }, { ratio: 1, price: 1 }] })).toThrow();
    expect(() => validateAlertLevels({ ...good, extra: true })).toThrow();
    expect(() => validateAlertLevels({ ...good, tool: 'trendline' })).toThrow();
    expect(() => validateAlertLevels({ ...good, levels: Array.from({ length: 65 }, (_, index) => ({ ratio: index, price: index + 1 })) })).toThrow();
  });
});

describe('crossedAlertLevel', () => {
  const set: AlertLevelSet = { schemaVersion: 1, drawingId: 'f', tool: 'fibretracement', levels: [{ ratio: 1, price: 100 }, { ratio: 0.5, price: 150 }, { ratio: 0, price: 200 }] };
  it('version 2: reaching a level from strictly below or above counts; the nearest crossed level is reported', () => {
    expect(crossedAlertLevel(set, 149, 150, true)).toEqual({ ratio: 0.5, price: 150 });
    expect(crossedAlertLevel(set, 151, 150, true)).toEqual({ ratio: 0.5, price: 150 });
    expect(crossedAlertLevel(set, 150, 151, true)).toBeNull();
    expect(crossedAlertLevel(set, 120, 130, true)).toBeNull();
    // A jump through two levels reports the last one passed in the direction of travel.
    expect(crossedAlertLevel(set, 90, 160, true)).toEqual({ ratio: 0.5, price: 150 });
    expect(crossedAlertLevel(set, 210, 140, true)).toEqual({ ratio: 0.5, price: 150 });
    expect(crossedAlertLevel(set, null, 150, true)).toBeNull();
  });
  it('version 1: strict crossing, matching the retained single-level policy', () => {
    expect(crossedAlertLevel(set, 149, 150, false)).toBeNull();
    expect(crossedAlertLevel(set, 150, 151, false)).toEqual({ ratio: 0.5, price: 150 });
  });
});

describe('level crossing alerts in the local evaluator', () => {
  const captured = captureFibActiveLevels(fib({ levels, reverse: false }));
  if (!captured.ok) throw Error('capture');
  const definition = (frequency: AlertDefinition['frequency'] = 'every-time', extra: Partial<AlertDefinition> = {}): AlertDefinition => ({ id: 'fib-alert', instrumentId: 'SYNTHETIC:FIB', sourceId: 'close', name: 'SYNTHETIC fib', message: 'Fib level crossed', condition: { kind: 'level-crossing', levels: captured.levels }, frequency, createdAt: 100, expiresAt: null, mode: 'ordinary', runId: 'ordinary', ...extra });
  let sequence = 0;
  const event = (value: number, time: number, barId = 'b' + time, barClosed = false): AlertEvent => ({ instrumentId: 'SYNTHETIC:FIB', sourceId: 'close', value, time, availableAt: time, sequence: sequence++, barId, barClosed, feedState: 'ready', mode: 'ordinary', runId: 'ordinary' });
  const run = (alert: LocalAlert, values: number[]) => { const fired: number[] = []; let current = alert; values.forEach((value, index) => { const result = processAlertEvent(current, event(value, 200 + index)); current = result.alert; if (result.notification) fired.push(value); }); return { alert: current, fired }; };
  it('fires on every crossing of any active level and never on a disabled level', () => {
    // -0.5 level is disabled (price 250); 38.2, 100, 150, 200 are active.
    const { fired } = run(createLocalAlert(definition()), [120, 140, 155, 145, 240, 260, 240]);
    expect(fired).toEqual([155, 145, 240]);
  });
  it('honours frequency: only once stops after the first crossing', () => {
    const { fired, alert } = run(createLocalAlert(definition('only-once')), [120, 160, 90]);
    expect(fired).toEqual([160]);
    expect(alert.status).toBe('stopped');
  });
  it('the notification names the crossed level', () => {
    let alert = createLocalAlert(definition());
    alert = processAlertEvent(alert, event(140, 300)).alert;
    const result = processAlertEvent(alert, event(151, 301));
    expect(result.notification?.message).toBe('Fib level crossed (level 0.5 at 150)');
  });
  it('rejects malformed definitions: no levels, levels on another condition, or a non-price source', () => {
    expect(() => createLocalAlert({ ...definition(), condition: { kind: 'level-crossing' } })).toThrow();
    expect(() => createLocalAlert({ ...definition(), condition: { kind: 'crossing', value: 1, levels: captured.levels } })).toThrow();
    expect(() => createLocalAlert(definition('every-time', { sourceId: 'indicator:x:y' }))).toThrow();
  });
  it('survives a save and restore round trip', () => {
    const { alert } = run(createLocalAlert(definition()), [120, 160]);
    const restored = restoreLocalAlerts(JSON.parse(JSON.stringify([alert])));
    expect(restored[0].definition.condition).toEqual({ kind: 'level-crossing', levels: captured.levels });
    expect(restored[0].history).toHaveLength(1);
  });
});
