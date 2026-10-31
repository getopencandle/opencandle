import { describe, expect, it } from 'vitest';
import { getNativeIndicator, type NativeIndicator, type NativeIndicatorContext, type Vela } from '@luxalgo/vela';
import { createIndicatorPort, defaultPlotStyle } from '../../src/chart/indicator-port';
import { validateIndicatorInputs, validateIndicatorPlotStyle, validateIndicatorSnapshots } from '../../src/chart/indicator-settings';

// An actual native-indicator descriptor with a renderer-free host. No desktop/UI claim.
function host(options: { missingVolume?: boolean } = {}) {
  let sequence = 0, setterCalls = 0;
  const live = new Map<string, { model: NativeIndicator; pane: string }>();
  const bars = [10, 12, 14].map((close, index) => ({ time: (1700000000 + index * 60) * 1000, open: close, high: close + 1, low: close - 1, close, volume: options.missingVolume ? undefined : 100 }));
  const chart = {
    panes: { list: () => [...new Set(['price', ...[...live.values()].map(row => row.pane)])].map(id => ({ id, indicators: [...live].filter(([, row]) => row.pane === id).map(([id]) => ({ id })) })) },
    addNativeIndicator(type: string) {
      const descriptor = getNativeIndicator(type)!, id = `review-${++sequence}`, model = descriptor.create(), row = { model, pane: 'price' }; live.set(id, row);
      const handle = { id, title: descriptor.title, setInputs: (values: any) => { setterCalls++; model.setInputs(values); }, setVisible: (visible: boolean) => { setterCalls++; visible ? model.resume() : model.suspend(); }, moveTo: (target: any) => { row.pane = typeof target === 'string' ? target : target.pane; }, remove: () => { model.stop(); live.delete(id); } };
      model.start({ id, symbol: 'SYNTHETIC', timeframe: '1', live: false, data: {} as any, bars: () => bars, emit: () => {}, pushData: () => {}, setStatus: () => {} } as NativeIndicatorContext, descriptor.defaultInputs());
      return handle;
    },
  };
  return { chart: chart as unknown as Vela, setters: () => setterCalls };
}

describe('independent indicator boundary review', () => {
  it('rejects array/object values that coerce to valid style strings', () => {
    const style = defaultPlotStyle('sma', 'sma', 0);
    for (const invalid of [{ ...style, kind: ['line'] }, { ...style, lineStyle: ['solid'] }, { ...style, kind: { toString: () => 'line' } }]) expect(() => validateIndicatorPlotStyle(invalid)).toThrow();
  });
  it('rejects explicit null edit containers before a native setter or state mutation', () => {
    const native = host(), port = createIndicatorPort(native.chart), id = port.add('sma', { length: 2 }), original = port.serialize(), calls = native.setters();
    try {
      for (const patch of [{ inputs: null }, { plots: null }]) { expect(() => port.update(id, patch as never)).toThrow(); expect(port.serialize()).toEqual(original); expect(native.setters()).toBe(calls); }
    } finally { port.dispose(); }
  });
  it('rejects accessor inputs without executing them as if they were imported scalar JSON', () => {
    let accessed = 0; const inputs = { get length() { accessed++; return 2; } };
    expect(() => validateIndicatorInputs('sma', inputs)).toThrow(); expect(accessed).toBe(0);
  });
  it('rejects future graph sources and duplicate IDs without altering otherwise valid snapshots', () => {
    const original = { id: 'a', kind: 'sma', inputs: { length: 2, source: 'close' }, plots: {}, offset: 0, visible: true, paneId: 'price' };
    const before = JSON.stringify(original);
    expect(() => validateIndicatorSnapshots([{ ...original, inputs: { length: 2, source: { instanceId: 'b', plot: 'rsi' } } }])).toThrow();
    expect(() => validateIndicatorSnapshots([original, structuredClone(original)])).toThrow(); expect(JSON.stringify(original)).toBe(before);
  });
  it('allows hide, show and style edits on unavailable volume indicators without fabricating values', () => {
    const native = host({ missingVolume: true }), port = createIndicatorPort(native.chart);
    try {
      for (const kind of ['volume', 'vwap', 'obv'] as const) {
        const id = port.add(kind), initial = port.values(id);
        expect(initial.diagnostics.join(' ')).toMatch(/volume/i); expect(initial.series).toEqual([]);
        expect(() => port.update(id, { visible: false })).not.toThrow();
        expect(port.list().find(row => row.id === id)?.visible).toBe(false);
        expect(() => port.update(id, { visible: true })).not.toThrow();
        const style = { ...defaultPlotStyle(kind, kind, 0), color: '#123456' };
        expect(() => port.update(id, { plots: { [kind]: style } })).not.toThrow();
        expect(port.serialize().find(row => row.id === id)?.plots[kind]).toEqual(style);
        expect(port.values(id).series).toEqual([]); expect(port.values(id).diagnostics).toEqual(initial.diagnostics);
        if (kind === 'volume') {
          const before = port.serialize(), calls = native.setters();
          expect(() => port.update(id, { inputs: { length: 2 } })).toThrow(/volume/i);
          expect(port.serialize()).toEqual(before); expect(native.setters()).toBe(calls);
        }
      }
    } finally { port.dispose(); }
  });
});
