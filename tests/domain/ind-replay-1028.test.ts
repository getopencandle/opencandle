// Bar Replay on LV derived chart types (Range, Renko, Kagi, Point and figure, Line break). SYNTHETIC bars;
// unit tests of the replay frame + derived transform, not GUI evidence.
import { describe, expect, it } from 'vitest';
import { fixtureDataset, fixtureInstrument } from '../../src/domain/fixtures';
import type { Bar, BarDataset } from '../../src/domain/types';
import { openReplay, selectReplayStart, stepReplaySession, replayChartView, replayParticipantSupport, REPLAY_LV_DERIVED_CHART_TYPES, REPLAY_UNSUPPORTED_CHART_TYPES, type ReplayParticipant } from '../../src/domain/replay-session';
import { derivedCalculation } from '../../src/chart/calculation-bars';
import { derivedCalculationSettings, derivedSettingsDefaults } from '../../src/chart/derived/derived-settings';
import type { DerivedStyle } from '../../src/chart/derived';

const T0 = Date.UTC(2024, 0, 1) / 1000;
function synthetic(count: number): BarDataset {
  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) { const base = 100 + 3 * Math.sin(i / 4) + i * 0.05; bars.push({ time: T0 + i * 3600, open: base, high: base + 0.6, low: base - 0.5, close: base + 0.2 * Math.cos(i), volume: 10 }); }
  return { instrument: fixtureInstrument('AAA'), bars, resolution: '1h', provenance: { ...fixtureDataset('AAA', 1).provenance, datasetId: 'test:AAA:1h', revision: '1' } };
}
const chart = synthetic(120);
const row = (chartType: string): ReplayParticipant => ({ cellId: 'c1', instrumentId: chart.instrument.id, symbol: 'AAA', interval: '1h', chartType, datasetId: chart.provenance.datasetId, revision: '1' });
const settingsFor = (style: string) => derivedCalculationSettings(style as DerivedStyle, { ...derivedSettingsDefaults(style as DerivedStyle), ...(style === 'range' ? { range: 50 } : {}) });
const derive = (bars: readonly Bar[], style: string, lastBarOpen: boolean, pinnedStep?: number | null) => {
  const result = derivedCalculation(bars, style, { settings: settingsFor(style), tickSize: 0.01, lastBarOpen, ...(pinnedStep != null ? { pinnedStep } : {}) });
  if (!result.ok) throw new Error(result.diagnostic.message);
  return result.value;
};
const strip = (rows: readonly Bar[]) => rows.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));

describe('IND-REPLAY-1028 replay on derived chart types', () => {
  it('the five OpenCandle derived types replay; Volume footprint and TPO stay refused', () => {
    expect([...REPLAY_LV_DERIVED_CHART_TYPES].sort()).toEqual(['kagi', 'linebreak', 'pointfigure', 'range', 'renko']);
    for (const type of REPLAY_LV_DERIVED_CHART_TYPES) { expect(REPLAY_UNSUPPORTED_CHART_TYPES[type]).toBeUndefined(); expect(replayParticipantSupport(row(type)).supported).toBe(true); }
    expect(replayParticipantSupport(row('footprint'))).toEqual({ supported: false, reason: 'Volume footprint charts are not available in Bar Replay. Switch to a time-based chart type to replay.' });
    expect(replayParticipantSupport(row('tpo')).supported).toBe(false);
    // A Range INTERVAL (as opposed to the Range chart type on a time series) is still refused.
    expect(replayParticipantSupport({ ...row('range'), interval: '100R' }).supported).toBe(false);
  });
  for (const style of REPLAY_LV_DERIVED_CHART_TYPES) {
    it(`${style}: a replay frame builds only from revealed bars, and confirmed bars never change as replay moves forward`, () => {
      let session = openReplay({ participants: [row(style)], activeCellId: 'c1', sessionId: 's-' + style });
      session = selectReplayStart(session, chart, chart.bars[59].time, '1h');
      let view = replayChartView(session, chart, null);
      expect(view.state).not.toBeNull();
      const revealed = view.frame.bars; expect(revealed.length).toBe(60);
      expect(revealed.at(-1)!.time).toBe(chart.bars[59].time);
      const during = derive(revealed, style, true);
      // No display bar is built from an unrevealed source bar.
      for (const bar of [...during.confirmed, ...during.projection]) expect(bar.time).toBeLessThanOrEqual(revealed.at(-1)!.time);
      // Confirmed bars equal the bars the full history confirms by the same point (no look-ahead, no repaint). An ATR or
      // Percentage step is the one the run resolved from the revealed bars (the chart pins it per replay run, adapter derivedFor).
      const step = during.step;
      const full = derive(chart.bars, style, false, step);
      const head = full.confirmed.filter(bar => (bar.confirmedAt ?? Infinity) < revealed.length - 1);
      expect(strip(during.confirmed)).toEqual(strip(head));
      // Stepping forward keeps every confirmed bar already shown.
      session = stepReplaySession(session, chart.bars.map(bar => bar.time + 3600), 10);
      view = replayChartView(session, chart, null); expect(view.frame.bars.length).toBe(70);
      const later = derive(view.frame.bars, style, true, step);
      expect(strip(later.confirmed.slice(0, during.confirmed.length))).toEqual(strip(during.confirmed));
    });
  }
});
