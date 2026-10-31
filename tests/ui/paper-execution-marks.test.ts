import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { barIndexAt, observePaperFills, paperExecutionLabel, paperExecutionMarks, paperExecutionPlacement, paperFillTime, PAPER_EXECUTION_ARROW_PX, PAPER_EXECUTION_OFFSET_PX } from '../../src/chart/paper-executions';
import { createExecutionSoundPlayer, EXECUTION_TONES, PaperExecutionMarks, type PaperExecutionProjection } from '../../src/ui/PaperExecutionMarks';
import { createPaperAccount, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { feedPaperBars } from '../../src/domain/paper-bar-feed';
import { factoryAppearance, factoryPriceScale, visibleTabView, type ChartSettingsSources } from '../../src/chart/chart-settings-bindings';
import { defaultChartSettingsDocument } from '../../src/chart/chart-settings-document';
import type { Instrument } from '../../src/domain/types';

// Virtual fills paint at their bar and price, with optional labels and sound,
// following Chart settings > Trading. Synthetic instrument and prices, virtual money only; static markup, no DOM or GUI.
const instrument: Instrument = { id: 'SYNTHETIC:FILLS', symbol: 'FILLS', name: 'Synthetic fills', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const bar = (time: number, close: number) => ({ time, open: close, high: close, low: close, close, volume: 1 });
const feed = (account: PaperAccount, ...bars: ReturnType<typeof bar>[]) => feedPaperBars(account, { bars, instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
const bars = [bar(60, 100), bar(120, 101), bar(180, 102)];
function filled(): PaperAccount {
  let account = feed(createPaperAccount(), bar(60, 100));
  account = submitPaperOrder(account, { instrument, quantity: 2, side: 'buy', type: 'market' } as never, 60).account;
  account = feed(account, bar(60, 100), bar(120, 101));
  account = submitPaperOrder(account, { instrument, quantity: 1, side: 'sell', type: 'market' } as never, 120).account;
  return feed(account, bar(120, 101), bar(180, 102));
}
const projection: PaperExecutionProjection = { left: 10, top: 20, width: 600, height: 300, priceToY: price => 20 + (120 - price) * 10 };
const timeToX = (seconds: number) => 10 + seconds;
const settings = (marks: boolean, labels: boolean) => ({ marks, labels, sound: { enabled: false, volume: 0.5, melody: 'Alarm Clock' } });
const markup = (account: PaperAccount, marks = true, labels = false) => renderToStaticMarkup(React.createElement(PaperExecutionMarks, { account, instrument, bars, settings: settings(marks, labels), projection: () => projection, timeToX, playSound: () => {} }));

describe('execution marks model', () => {
  it('snaps each fill of this instrument to the bar that contains it', () => {
    const account = filled(), marks = paperExecutionMarks(account.fills, instrument.id, bars, instrument.tickSize);
    expect(account.fills).toHaveLength(2);
    expect(marks.map(mark => [mark.side, mark.quantity, mark.price, mark.barTime])).toEqual([['buy', 2, 100, 60], ['sell', 1, 101, 120]]);
  });
  it('labels side, quantity and price at the instrument tick', () => {
    expect(paperExecutionLabel('buy', 2, 100, 0.01)).toBe('Buy 2 at 100.00');
    expect(paperExecutionLabel('sell', 1.5, 0.1234, 0.0001)).toBe('Sell 1.5 at 0.1234');
  });
  it('leaves out other instruments and fills before the first loaded bar; later fills belong to the last bar', () => {
    const fill = (id: string, at: number, instrumentId = instrument.id) => ({ id, instrumentId, side: 'buy' as const, quantity: 1, price: 100, at, quoteEventTime: at });
    const marks = paperExecutionMarks([fill('early', 10), fill('other', 130, 'SYNTHETIC:OTHER'), fill('mid', 150), fill('late', 900)], instrument.id, bars, 0.01);
    expect(marks.map(mark => [mark.id, mark.barTime])).toEqual([['mid', 120], ['late', 180]]);
    expect(barIndexAt(bars, 59)).toBe(-1); expect(barIndexAt(bars, 60)).toBe(0); expect(barIndexAt(bars, 179)).toBe(1);
    expect(paperFillTime({ ...fill('x', 500), quoteEventTime: 0 })).toBe(500);
  });
  it('keeps only the newest fills up to the limit', () => {
    const fills = Array.from({ length: 8 }, (_, index) => ({ id: 'f' + index, instrumentId: instrument.id, side: 'buy' as const, quantity: 1, price: 100, at: 60 + index }));
    expect(paperExecutionMarks(fills, instrument.id, bars, 0.01, 3).map(mark => mark.id)).toEqual(['f5', 'f6', 'f7']);
  });
  it('a buy arrow points up from below the fill price, a sell arrow down from above it', () => {
    expect(paperExecutionPlacement('buy', 50, 100)).toEqual({ x: 50, tipY: 100 + PAPER_EXECUTION_OFFSET_PX, baseY: 100 + PAPER_EXECUTION_OFFSET_PX + PAPER_EXECUTION_ARROW_PX, direction: 'up' });
    expect(paperExecutionPlacement('sell', 50, 100)).toEqual({ x: 50, tipY: 100 - PAPER_EXECUTION_OFFSET_PX, baseY: 100 - PAPER_EXECUTION_OFFSET_PX - PAPER_EXECUTION_ARROW_PX, direction: 'down' });
  });
  it('reports only fills added since the last observation of the same account run', () => {
    const first = observePaperFills(null, 'a|run', [{ id: 'f1' }]);
    expect(first.fresh).toEqual([]);
    const second = observePaperFills(first.observation, 'a|run', [{ id: 'f1' }, { id: 'f2' }]);
    expect(second.fresh).toEqual(['f2']);
    expect(observePaperFills(second.observation, 'b|run', [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }]).fresh).toEqual([]);
    expect(observePaperFills(second.observation, 'a|run', [{ id: 'f9' }]).fresh).toEqual([]);
  });
});

describe('execution marks overlay', () => {
  it('paints one arrow per fill at its bar x and price y, in buy and sell colours', () => {
    const html = markup(filled()), account = filled(), marks = paperExecutionMarks(account.fills, instrument.id, bars, instrument.tickSize);
    expect(html).toContain('aria-label="Virtual executions"');
    expect(html.match(/<polygon /g)).toHaveLength(2);
    expect(html).toContain('data-execution="buy"'); expect(html).toContain('data-execution="sell"');
    expect(html).toContain('fill="#2f7fd1"'); expect(html).toContain('fill="#c9483f"');
    const buy = marks[0], x = timeToX(buy.barTime) - projection.left, y = projection.priceToY(buy.price) - projection.top;
    expect(html).toContain(`points="${x},${y + PAPER_EXECUTION_OFFSET_PX} `);
    expect(html).toContain('pointer-events:none');
  });
  it('labels show only when Execution labels is on', () => {
    expect(markup(filled(), true, false)).not.toContain('lv-paper-execution-label');
    const html = markup(filled(), true, true);
    expect(html).toContain('data-execution-label="buy"'); expect(html).toContain('>Buy 2 at 100.00<');
  });
  it('nothing is painted when Executions is off, or without fills', () => {
    expect(markup(filled(), false, true)).toBe('');
    expect(markup(createPaperAccount())).toBe('');
  });
});

describe('execution sound', () => {
  function fakeContext() {
    const gains: number[] = [], starts: number[] = [];
    const context = { state: 'running', currentTime: 0, destination: {}, createOscillator: () => ({ type: '', frequency: { setValueAtTime: () => {} }, connect: () => {}, start: (time: number) => starts.push(time), stop: () => {} }), createGain: () => ({ gain: { setValueAtTime: () => {}, linearRampToValueAtTime: (value: number) => { if (value > 0) gains.push(value); } }, connect: () => {} }) };
    return { context, gains, starts };
  }
  it('plays the LV tone sequence scaled by the volume setting', async () => {
    const fake = fakeContext(), play = createExecutionSoundPlayer(() => fake.context);
    await play(0.5, 'Alarm Clock');
    expect(fake.starts).toHaveLength(EXECUTION_TONES.length);
    expect(fake.gains.every(value => Math.abs(value - 0.15) < 1e-9)).toBe(true);
  });
  it('stays silent at volume 0 and without audio output', async () => {
    const fake = fakeContext(), factory = vi.fn(() => fake.context);
    await createExecutionSoundPlayer(factory)(0, 'Alarm Clock');
    expect(factory).not.toHaveBeenCalled();
    await expect(createExecutionSoundPlayer(null)(1, 'Alarm Clock')).resolves.toBeUndefined();
  });
});

describe('Chart settings > Trading rows now work', () => {
  const sources = (): ChartSettingsSources => ({ appearance: factoryAppearance(), document: defaultChartSettingsDocument(), documentConnected: true, priceScale: factoryPriceScale(), ratio: 0.5, style: 'candles', typeSettings: null, timezone: 'UTC', exchangeTimezone: null, scaleMode: { scale: 'linear', invert: false, auto: true } });
  it('Executions, Execution labels and the execution sound are live rows, defaults marks on, labels off, sound off', () => {
    const rows = visibleTabView('trading', sources()).flatMap(group => group.rows);
    // Buy/sell buttons, Positions and orders, the P&L rows and alignment are live too.: so are One-click trading and Reverse position button.
    expect(rows.map(row => row.key).sort()).toEqual(['trading.bracketsPLDisplay', 'trading.extendLeftTradingLine', 'trading.marketProjectOrderVisibility', 'trading.positionAlign', 'trading.positionAndBracketsPL', 'trading.positionPL', 'trading.reverseButton', 'trading.tradingConfirmEnabled', 'trading.tradingExecutions', 'trading.tradingExecutionsLables', 'trading.tradingNotifications', 'trading.tradingPositionsAndOrders', 'trading.tradingSellBuyPanel', 'trading.tradingSoundMelody', 'trading.tradingSoundVolume', 'trading.visibilityOnScreenshotTitle']);
    expect(rows.every(row => row.availability.state === 'live')).toBe(true);
    const trading = defaultChartSettingsDocument().trading;
    expect([trading.executionMarks, trading.executionLabels, trading.executionSound.enabled]).toEqual([true, false, false]);
  });
  it('the App feeds the overlay from those settings (source wiring)', async () => {
    const { readFileSync } = await import('node:fs');
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('<PaperExecutionMarks account={activeAccount} instrument={dataset.instrument} bars={bars} settings={{marks:shownSettings.trading.executionMarks,labels:shownSettings.trading.executionLabels,sound:shownSettings.trading.executionSound}}');/* Live-previewed settings */
  });
});
