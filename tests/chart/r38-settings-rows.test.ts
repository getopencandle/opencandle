import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { factoryAppearance, factoryPriceScale, findRow, visibleTabView, writeRow, type ChartSettingsSources } from '../../src/chart/chart-settings-bindings';
import { defaultChartSettingsDocument } from '../../src/chart/chart-settings-document';
import { lastChangePercentText } from '../../src/chart/axis-labels';
import { installAppearancePainters, type AxisLabelContext } from '../../src/chart/appearance-painters';
import { painterFixture, withHexColorProbe } from './chart-paint-harness';
import { composeChartExport } from '../../src/chart/image-export';
import { paintPaperSnapshot, PAPER_SNAPSHOT_COLORS } from '../../src/chart/paper-snapshot';
import { freshPaperNotifications, paperNotificationKey, paperNotificationWatermark } from '../../src/domain/paper-notifications';
import { createPaperAccount, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { feedPaperBars } from '../../src/domain/paper-bar-feed';
import { paperChartLines } from '../../src/ui/PaperChartLines';
import type { Instrument } from '../../src/domain/types';
import { nativeCoreHarness } from './native-core-harness';
import { createIndicatorPort } from '../../src/chart/indicator-port';
import { factoryIndicatorDefault } from '../../src/ui/indicator-library';
import type { IndicatorId } from '../../src/domain/indicators';

// The Chart settings rows that were saved but did nothing now act. SYNTHETIC
// instrument, bars and prices; virtual money only. No GUI claim: unit and source-wiring checks.
const sources = (): ChartSettingsSources => ({ appearance: factoryAppearance(), document: defaultChartSettingsDocument(), documentConnected: true, priceScale: factoryPriceScale(), ratio: 0.5, style: 'candles', typeSettings: null, timezone: 'UTC', exchangeTimezone: null, scaleMode: { scale: 'linear', invert: false, auto: true } });
const visibleKeys = (tab: Parameters<typeof visibleTabView>[0]) => visibleTabView(tab, sources()).flatMap(group => group.rows).map(row => row.key);
const read = (path: string) => readFileSync(path, 'utf8');

describe('rows that are live now', () => {
  it('Show only rejection notifications, trading lines in snapshots and Scales placement are live and shown', () => {
    for (const [tab, key] of [['trading', 'trading.tradingNotifications'], ['trading', 'trading.visibilityOnScreenshotTitle'], ['scales', 'scales.scalesPlacement']] as const) {
      expect(findRow(tab, sources(), key)!.availability, key).toEqual({ state: 'live' });
      expect(visibleKeys(tab), key).toContain(key);
    }
  });
  it('the Price and percentage value select under Symbol is enabled and saved', () => {
    const row = findRow('scales', sources(), 'scales.symbolLabelsLines')!;
    expect(row.disabledParts).not.toContain('sub');
    const next = writeRow(sources(), 'scales.symbolLabelsLines', { ...row.value, sub: 'pricePercent' });
    expect(next.document.scales.symbolValueMode).toBe('pricePercent');
  });
  it('news rows are live (news badges); earnings is live (calendar markers) with breaks disabled', () => {
    // Pin updated: Latest news and News notification now drive <NewsChartMarkers> (src/domain/news-chart-markers.ts), so they are live, not saved-only.
    for (const key of ['events.lastNews', 'events.notificationAboutNews']) expect(findRow('events', sources(), key)!.availability.state, key).toBe('live');
    expect(findRow('events', sources(), 'events.earnings')!.availability.state).not.toBe('stored');
    expect(findRow('events', sources(), 'events.earnings')!.disabledParts).toContain('nested');
    expect(visibleKeys('events')).toEqual(['events.symbolDividends', 'events.symbolSplits', 'events.earnings', 'events.economicEvents', 'events.lastNews', 'events.notificationAboutNews']); // News rows shown once live
  });
});

describe('Scales placement', () => {
  it('Stack on the left moves the main price scale left; Stack on the right moves it back; Auto leaves it where it is', () => {
    const left = writeRow(sources(), 'scales.scalesPlacement', { selected: 'left' });
    expect(left.priceScale).toMatchObject({ placement: 'left', mainSide: 'left' });
    const right = writeRow(left, 'scales.scalesPlacement', { selected: 'right' });
    expect(right.priceScale!.placement).toBe('right'); expect(Object.hasOwn(right.priceScale!, 'mainSide')).toBe(false);
    const autoFromLeft = writeRow(left, 'scales.scalesPlacement', { selected: 'auto' });
    expect(autoFromLeft.priceScale).toMatchObject({ placement: 'auto', mainSide: 'left' });
    const autoFromRight = writeRow(sources(), 'scales.scalesPlacement', { selected: 'auto' });
    expect(Object.hasOwn(autoFromRight.priceScale!, 'mainSide')).toBe(false);
  });
  const rows = Array.from({ length: 60 }, (_, i) => { const close = 50 + 5 * Math.sin(i / 3) + (i % 4); return { time: 1700000000000 + i * 60000, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 100 + i }; });
  let host: Awaited<ReturnType<typeof nativeCoreHarness>>, port: ReturnType<typeof createIndicatorPort>;
  beforeAll(async () => { host = await nativeCoreHarness(); port = createIndicatorPort(host.chart, undefined, undefined, undefined, host.bridge.claim); host.core.bars = rows; });
  afterAll(() => { try { port.dispose(); } finally { host.dispose(); } });
  const add = (kind: IndicatorId) => { const factory = factoryIndicatorDefault(kind); return port.add(kind, factory.inputs, factory) as string; };
  it('stacks every extra indicator scale on one side, keeps shared scales together, and leaves shared and no-scale indicators alone', () => {
    const sma = add('sma'), ema = add('ema'), bb = add('bb'), wma = add('wma');
    port.setScale(sma, 'own'); port.setScale(ema, { scaleOf: sma }); port.setScale(bb, 'left');
    expect(port.stackScales('left')).toBe(2);
    expect(port.scale(sma)).toMatchObject({ placement: 'left', group: sma }); expect(port.scale(ema)).toMatchObject({ placement: 'left', group: sma });
    expect(port.scale(bb).placement).toBe('left'); expect(port.scale(wma).placement).toBe('shared');
    const saved = (id: string) => port.serialize().find(row => row.id === id)!;
    expect(saved(ema)).toMatchObject({ ownScale: true, scalePlacement: 'left', scaleGroup: sma });
    expect(port.stackScales('left')).toBe(0);
    expect(port.stackScales('right')).toBe(3);
    expect(port.scale(sma)).toMatchObject({ placement: 'own', group: sma }); expect(port.scale(bb).placement).toBe('own');
    expect(Object.hasOwn(saved(bb), 'scalePlacement')).toBe(false);
  });
});

describe('Symbol label: Price and percentage value', () => {
  const DAY = 86_400_000;
  it('is the change from the previous day close on intraday bars and from the previous bar on daily and longer bars', () => {
    const intraday = [{ time: Date.UTC(2026, 9, 19, 20), close: 25 }, { time: Date.UTC(2026, 9, 20, 14), close: 24 }, { time: Date.UTC(2026, 9, 20, 15), close: 26 }];
    expect(lastChangePercentText(intraday, 3_600_000, 'UTC', 27.5)).toBe('+10.00%');
    expect(lastChangePercentText([{ time: 0, close: 50 }, { time: DAY, close: 40 }], DAY, 'UTC', 40)).toBe('-20.00%');
    expect(lastChangePercentText([{ time: 0, close: 50 }, { time: 7 * DAY, close: 50 }], 7 * DAY, 'UTC', 50)).toBe('0.00%');
    expect(lastChangePercentText([{ time: 0, close: 50 }], DAY, 'UTC', 50)).toBeNull();
    expect(lastChangePercentText([{ time: 0, close: 0 }, { time: DAY, close: 1 }], DAY, 'UTC', 1)).toBeNull();
  });
  const context = (lastChange: boolean): AxisLabelContext => ({ labels: { symbolName: false, prevClose: false, highLow: false, noOverlap: true }, lines: { prevCloseLine: false }, symbol: 'SYNTH', timezone: 'UTC', session: { kind: 'continuous', extended: true }, drawings: () => [], selected: () => [], lastChange });
  it('paints the percentage row under the last price chip only while the setting is on', async () => {
    const f = await painterFixture(false); let on = true;
    const dispose = installAppearancePainters(f.renderer, () => context(on));
    try {
      f.native.scene.priceStyle = 'line'; f.native.scene.style.line.color = '#22ab94'; f.native.scene.showCountdown = false; f.native.scene.showPriceLabel = true; f.native.theme = { ...f.native.theme, background: '#131722', textColor: '#d1d4dc' };
      f.native.scene.bars = [{ time: DAY, open: 40, high: 41, low: 39, close: 40, volume: 1 }, { time: 2 * DAY, open: 40, high: 45, low: 40, close: 44, volume: 1 }]; f.coords.barInterval = DAY;
      const paint = () => { f.recording.commands.length = 0; withHexColorProbe(() => f.native.chrome.drawPriceLineAndCountdown(f.recording.ctx, f.native.scene, f.coords, f.native.theme, 300, f.pane)); return f.recording.commands.filter(row => row.op === 'fillText').map(row => row.values[0]); };
      const texts = paint();
      expect(texts).toContain('44.00'); expect(texts).toContain('+10.00%');
      on = false; expect(paint()).not.toContain('+10.00%');
    } finally { dispose(); f.dispose(); }
  });
  it('the grid passes the saved mode to the chart (source wiring)', () => {
    expect(read('src/ui/MultiChartGrid.tsx')).toContain('chart.setLastValueMode(scales.symbolValueMode)');
    expect(read('src/chart/adapter.ts')).toContain("lastChange:lastValueMode==='pricePercent'");
  });
});

const instrument: Instrument = { id: 'SYNTHETIC:R38', symbol: 'R38', name: 'Synthetic R38', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const bar = (time: number, close: number) => ({ time, open: close, high: close, low: close, close, volume: 1 });
const feed = (account: PaperAccount, ...bars: ReturnType<typeof bar>[]) => feedPaperBars(account, { bars, instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;

describe('Show only rejection notifications', () => {
  function trading() {
    let account = feed(createPaperAccount(), bar(60, 100));
    const start = paperNotificationWatermark(account);
    account = submitPaperOrder(account, { instrument, quantity: 1, side: 'buy', type: 'limit', limitPrice: 90 } as never, 60).account;
    account = submitPaperOrder(account, { instrument, quantity: 1_000_000, side: 'buy', type: 'limit', limitPrice: 99 } as never, 60).account;
    account = submitPaperOrder(account, { instrument, quantity: 2, side: 'buy', type: 'market' } as never, 60).account;
    account = feed(account, bar(60, 100), bar(120, 101));
    return { account, start };
  }
  it('every new order event becomes a notification by default', () => {
    const { account, start } = trading(), fresh = freshPaperNotifications(account, start, false);
    // The market order placed and filled in this update shows only its fill.
    expect(fresh.notifications.map(row => row.kind)).toEqual(['submitted', 'submitted', 'rejected', 'filled']);
    expect(fresh.notifications.map(row => row.title)).toEqual(['Virtual order placed', 'Virtual order placed', 'Virtual order rejected', 'Virtual order filled']);
    expect(fresh.notifications.map(row => row.rejection)).toEqual([false, false, true, false]); expect(fresh.notifications[2].body).toContain('R38: Insufficient virtual buying power');
    expect(fresh.watermark).toBe(paperNotificationWatermark(account));
    expect(freshPaperNotifications(account, fresh.watermark, false).notifications).toEqual([]);
  });
  it('with the row checked only rejections are notified, and the watermark still moves past the others', () => {
    const { account, start } = trading(), fresh = freshPaperNotifications(account, start, true);
    expect(fresh.notifications.map(row => row.kind)).toEqual(['rejected']);
    expect(fresh.watermark).toBe(paperNotificationWatermark(account));
  });
  it('a reset or another account is a new key, so its history is never announced', () => {
    const { account } = trading();
    expect(paperNotificationKey(account)).not.toBe(paperNotificationKey(createPaperAccount({ id: 'other' })));
  });
  it('the App mounts the toasts with the saved setting (source wiring)', () => {
    expect(read('src/ui/App.tsx')).toContain('<PaperTradingToasts account={activeAccount} rejectionOnly={shownSettings.trading.rejectionOnly}');/* App passes the live-previewed settings (shownSettings; the saved ones unless Chart settings is open) */
  });
});

/** Minimal recording 2D context. */
function recorder() {
  const calls: { op: string; args: unknown[]; fill?: unknown; stroke?: unknown; dash?: unknown }[] = [];
  let dash: number[] = [];
  const ctx: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1 };
  for (const op of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'closePath', 'rect', 'clip', 'fillRect', 'fillText', 'drawImage', 'translate', 'scale'])
    ctx[op] = (...args: unknown[]) => { calls.push({ op, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, dash: [...dash] }); };
  ctx.setLineDash = (value: number[]) => { dash = [...value]; };
  ctx.measureText = (text: string) => ({ width: text.length * 6 });
  ctx.createLinearGradient = () => ({ addColorStop() { /* recorded elsewhere */ } });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('Orders, executions, and positions in chart snapshots', () => {
  function positioned() {
    let account = feed(createPaperAccount(), bar(60, 100));
    account = submitPaperOrder(account, { instrument, quantity: 2, side: 'buy', type: 'market' } as never, 60).account;
    account = feed(account, bar(60, 100), bar(120, 101));
    account = submitPaperOrder(account, { instrument, quantity: 1, side: 'sell', type: 'limit', limitPrice: 110 } as never, 120).account;
    return account;
  }
  const frame = { scale: 2, plot: { left: 0, top: 0, width: 400, height: 300 }, priceToY: (price: number) => (120 - price) * 10, timeToX: (seconds: number) => seconds };
  it('paints each order and position line with its label, and the execution marks, at the export scale', () => {
    const account = positioned(), lines = paperChartLines(account, instrument), { ctx, calls } = recorder();
    const marks = [{ id: 'f1', side: 'buy' as const, quantity: 2, price: 100, barTime: 60, label: 'Buy 2 at 100.00' }];
    const painted = paintPaperSnapshot(ctx, { lines, marks, labels: true, alignment: 'right', extendLines: true }, frame);
    expect(painted).toBe(lines.length + marks.length);
    const texts = calls.filter(call => call.op === 'fillText').map(call => call.args[0]);
    for (const line of lines) expect(texts).toContain(line.label);
    expect(texts).toContain('Buy 2 at 100.00');
    const fills = calls.filter(call => call.op === 'fillRect').map(call => call.fill);
    expect(fills).toContain(PAPER_SNAPSHOT_COLORS.position); expect(fills).toContain(PAPER_SNAPSHOT_COLORS.sell);
    // The position line at 100 is y 200 css px, 400 canvas px; full width at scale 2.
    const strokes = calls.filter(call => call.op === 'lineTo').map(call => call.args);
    expect(strokes).toContainEqual([800, 400.5]);
  });
  it('a line off the pane is left out, short lines follow Extended price lines off, labels follow Execution labels off', () => {
    const account = positioned(), lines = paperChartLines(account, instrument), { ctx, calls } = recorder();
    paintPaperSnapshot(ctx, { lines: [...lines, { ...lines[0], id: 'far', price: 1000, label: 'far away' }], marks: [{ id: 'f1', side: 'buy', quantity: 2, price: 100, barTime: 60, label: 'Buy 2 at 100.00' }], labels: false, alignment: 'right', extendLines: false }, frame);
    const texts = calls.filter(call => call.op === 'fillText').map(call => call.args[0]);
    expect(texts).not.toContain('far away'); expect(texts).not.toContain('Buy 2 at 100.00');
    const starts = calls.filter(call => call.op === 'moveTo').map(call => call.args[0] as number);
    expect(Math.min(...starts)).toBeGreaterThan(0);
  });
  it('the export composite runs the overlay over the chart pixels, before the caption', () => {
    const order: string[] = [];
    const out = recorder(); const native = { width: 200, height: 100 } as HTMLCanvasElement;
    const canvas = { width: 0, height: 0, getContext: () => { const ctx = out.ctx as unknown as Record<string, unknown>; const draw = ctx.drawImage as (...a: unknown[]) => void, text = ctx.fillText as (...a: unknown[]) => void; ctx.drawImage = (...a: unknown[]) => { order.push('chart'); draw(...a); }; ctx.fillText = (...a: unknown[]) => { order.push('text'); text(...a); }; return ctx; } } as unknown as HTMLCanvasElement;
    composeChartExport(native, null, { label: 'SYNTHETIC', datasetId: 'synthetic', revision: 'r1', providerId: 'synthetic' } as never, () => canvas, 1, ctx => { order.push('overlay'); ctx.fillText('lines', 0, 0); });
    expect(order.slice(0, 3)).toEqual(['chart', 'overlay', 'text']);
  });
  it('the App passes the overlay only while the row is checked (source wiring)', () => {
    const app = read('src/ui/App.tsx');
    expect(app).toContain('paperSnapshotOverlay()');
    expect(app).toContain('if(!trading.inSnapshots||!account)return undefined');
  });
});
