import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { importPineScript } from '../../src/domain/pine-import';
import { makeFixture } from '../../src/domain/fixtures';
import { atr, bollingerBands, ema, macd, rsi, sma, stochastic } from '../../src/domain/indicators';

// Round trips. Each Pine fixture below is a short script written for this test (no the reference app script is
// bundled). It is translated to LVScript, run in the real restricted QuickJS worker on the synthetic SPY demo bars,
// and its plots are compared with LV's own built-in indicator functions where an equivalent exists, otherwise with
// values computed by hand in the test.
const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
const demo = makeFixture('SPY', 300);
const bars = demo.map((bar, index) => ({ id: 'pine-import-demo-' + index, revision: 1, ...bar }));
const close = demo.map(bar => bar.close);
const jobs = new ScriptJobs();
afterAll(() => jobs.close());

interface Run { plots: Map<string, (number | null)[]>; value: any; source: string; report: ReturnType<typeof importPineScript>['report'] }
async function translateAndRun(pine: string): Promise<Run> {
  const imported = importPineScript(pine);
  expect(imported.ok, JSON.stringify(imported.report)).toBe(true);
  const result = await jobs.run({ requestId: 'pine-import', source: imported.source, bars });
  expect(result.ok, (result.error?.message ?? '') + '\n' + imported.source).toBe(true);
  const plots = new Map<string, (number | null)[]>();
  for (const plot of result.value.plots) plots.set(plot.title, plot.values.map((row: { value: number | null }) => row.value));
  return { plots, value: result.value, source: imported.source, report: imported.report };
}
function close6(actual: readonly (number | null)[] | undefined, expected: readonly (number | null)[]) {
  expect(actual).toBeDefined();
  expect(actual!.length).toBe(expected.length);
  let compared = 0;
  for (let i = 0; i < expected.length; i++) {
    const a = actual![i], b = expected[i];
    if (b === null || b === undefined) { expect(a, 'bar ' + i).toBeNull(); continue; }
    expect(a, 'bar ' + i).not.toBeNull(); expect(Math.abs(a! - b), 'bar ' + i).toBeLessThan(1e-6); compared++;
  }
  expect(compared).toBeGreaterThan(100);
}

describe('PINE-IMPORT1 round trips on the demo bars', { timeout: 120000 }, () => {
  it('SMA cross: both averages match OpenCandle sma and the cross markers match the crossings', async () => {
    const run = await translateAndRun(`//@version=5
indicator("SMA cross", overlay=true)
fastLen = input.int(10, "Fast", minval=1)
slowLen = input.int(30, "Slow", minval=1)
fast = ta.sma(close, fastLen)
slow = ta.sma(close, slowLen)
plot(fast, "Fast", color=color.orange)
plot(slow, "Slow", color=color.blue)
plotshape(ta.crossover(fast, slow), "Up", shape.triangleup, location.belowbar, color.green)
plotshape(ta.crossunder(fast, slow), "Down", shape.triangledown, location.abovebar, color.red)
`);
    const fast = sma(close, 10), slow = sma(close, 30);
    close6(run.plots.get('Fast'), fast); close6(run.plots.get('Slow'), slow);
    let ups = 0, downs = 0;
    for (let i = 1; i < close.length; i++) {
      const [a, b, c, d] = [fast[i - 1], slow[i - 1], fast[i], slow[i]];
      if (a === null || b === null || c === null || d === null) continue;
      if (c > d && a <= b) ups++; if (c < d && a >= b) downs++;
    }
    const shapes = run.value.visuals.markers ?? run.value.visuals.shapes;
    expect(shapes.filter((row: { title: string }) => row.title === 'Up').length).toBe(ups);
    expect(shapes.filter((row: { title: string }) => row.title === 'Down').length).toBe(downs);
    expect(ups + downs).toBeGreaterThan(0);
    expect(run.value.declarations.inputs.map((row: { id: string }) => row.id)).toEqual(['fastLen', 'slowLen']);
  });
  it('RSI with levels: matches OpenCandle rsi, with two hlines and an hline fill', async () => {
    const run = await translateAndRun(`//@version=5
indicator("RSI levels")
length = input.int(14, "Length")
r = ta.rsi(close, length)
plot(r, "RSI", color=#b38cff)
upper = hline(70, "Upper", color=color.red, linestyle=hline.style_dashed)
lower = hline(30, "Lower", color=color.green)
fill(upper, lower, color=color.new(color.purple, 90))
`);
    close6(run.plots.get('RSI'), rsi(close, 14));
    expect(run.value.visuals.hlines.map((row: { title: string; price: number }) => [row.title, row.price])).toEqual([['Upper', 70], ['Lower', 30]]);
    expect(run.value.visuals.fills[0]).toMatchObject({ from: 'Upper', to: 'Lower', between: 'hlines' });
  });
  it('Bollinger Bands: the tuple form matches OpenCandle bollingerBands', async () => {
    const run = await translateAndRun(`//@version=5
indicator("BB", overlay=true)
[middle, upper, lower] = ta.bb(close, 20, 2)
plot(middle, "Basis")
p1 = plot(upper, "Upper")
p2 = plot(lower, "Lower")
fill(p1, p2)
`);
    const bands = bollingerBands(close, 20, 2);
    close6(run.plots.get('Basis'), bands.basis); close6(run.plots.get('Upper'), bands.upper); close6(run.plots.get('Lower'), bands.lower);
  });
  it('MACD: line, signal and histogram match OpenCandle macd', async () => {
    const run = await translateAndRun(`//@version=6
indicator("MACD")
[macdLine, signalLine, hist] = ta.macd(close, 12, 26, 9)
plot(hist, "Histogram", color = hist >= 0 ? color.teal : color.maroon, style=plot.style_columns)
plot(macdLine, "MACD")
plot(signalLine, "Signal")
`);
    const reference = macd(close, 12, 26, 9);
    close6(run.plots.get('MACD'), reference.line); close6(run.plots.get('Signal'), reference.signal); close6(run.plots.get('Histogram'), reference.histogram);
  });
  it('var counter: counts up bars, persists across bars and keeps its own history', async () => {
    const run = await translateAndRun(`//@version=5
indicator("Up bars")
var int ups = 0
if close > open
    ups += 1
plot(ups, "Ups")
plot(ups - ups[1], "Step")
`);
    let count = 0; const expected: number[] = [], step: (number | null)[] = [];
    demo.forEach((bar, i) => { if (bar.close > bar.open) count++; expected.push(count); step.push(i === 0 ? null : count - expected[i - 1]); });
    expect(run.plots.get('Ups')).toEqual(expected);
    expect(run.plots.get('Step')).toEqual(step);
  });
  it('user functions: each call site keeps its own series (block and single-line forms)', async () => {
    const run = await translateAndRun(`//@version=5
indicator("Functions", overlay=true)
avg(src, len) =>
    s = ta.sma(src, len)
    s
double(x) => x * 2
plot(avg(close, 10), "Avg 10")
plot(avg(close, 20), "Avg 20")
plot(double(close), "Double")
`);
    close6(run.plots.get('Avg 10'), sma(close, 10)); close6(run.plots.get('Avg 20'), sma(close, 20));
    expect(run.plots.get('Double')).toEqual(close.map(value => value * 2));
    expect(run.source).toContain('const avg = (__k, src, len) =>');
  });
  it('history references: built-in series, expressions and variables', async () => {
    const run = await translateAndRun(`//@version=5
indicator("History")
diff = close - close[2]
mid = (high + low) / 2
plot(diff, "Diff")
plot(mid[1], "Mid 1")
plot(ta.ema(close, 10)[1], "EMA prior")
plot(nz(close[1], 0), "Prev or zero")
`);
    close6(run.plots.get('Diff'), close.map((value, i) => i < 2 ? null : value - close[i - 2]));
    close6(run.plots.get('Mid 1'), demo.map((_, i) => i < 1 ? null : (demo[i - 1].high + demo[i - 1].low) / 2));
    const e = ema(close, 10);
    close6(run.plots.get('EMA prior'), e.map((_, i) => i < 1 ? null : e[i - 1]));
    expect(run.plots.get('Prev or zero')![0]).toBe(0);
  });
  it('ATR and a smoothed stochastic match OpenCandle atr and stochastic %K', async () => {
    const run = await translateAndRun(`//@version=5
indicator("ATR and stoch")
plot(ta.atr(14), "ATR")
k = ta.sma(ta.stoch(close, high, low, 14), 3)
plot(k, "K")
`);
    close6(run.plots.get('ATR'), atr(demo, 14));
    close6(run.plots.get('K'), stochastic(demo, 14, 3, 3).k);
  });
  it('for loops, if/else and ternaries: a five-bar average equals OpenCandle sma(5)', async () => {
    const run = await translateAndRun(`//@version=5
indicator("Loop average", overlay=true)
total = 0.0
for i = 0 to 4
    total := total + nz(close[i])
avg5 = bar_index >= 4 ? total / 5 : na
trend = if close > avg5
    1
else if close < avg5
    -1
else
    0
plot(avg5, "Avg5")
plot(trend, "Trend")
`);
    const reference = sma(close, 5);
    close6(run.plots.get('Avg5'), reference);
    expect(run.plots.get('Trend')!.slice(4)).toEqual(reference.slice(4).map((value, i) => close[i + 4] > value! ? 1 : close[i + 4] < value! ? -1 : 0));
  });
  it('na handling: arithmetic with na stays na instead of becoming zero', async () => {
    const run = await translateAndRun(`//@version=5
indicator("Slope")
e = ta.ema(close, 10)
slope = e - e[1]
plot(slope, "Slope")
plot(na(slope) ? 1 : 0, "Missing")
plot(math.max(slope, 0), "Up slope")
`);
    const e = ema(close, 10), slope = e.map((value, i) => i < 1 || value === null || e[i - 1] === null ? null : value - e[i - 1]!);
    close6(run.plots.get('Slope'), slope);
    expect(run.plots.get('Missing')).toEqual(slope.map(value => value === null ? 1 : 0));
    close6(run.plots.get('Up slope'), slope.map(value => value === null ? null : Math.max(value, 0)));
  });
  it('strategy scripts translate to virtual OpenCandle orders, one entry per crossing', async () => {
    const run = await translateAndRun(`//@version=5
strategy("MA cross strategy", overlay=true, default_qty_value=3)
fast = ta.sma(close, 10)
slow = ta.sma(close, 30)
if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("Long")
plot(fast, "Fast")
`);
    const fast = sma(close, 10), slow = sma(close, 30);
    let ups = 0;
    for (let i = 1; i < close.length; i++) if ([fast[i - 1], slow[i - 1], fast[i], slow[i]].every(v => v !== null) && fast[i]! > slow[i]! && fast[i - 1]! <= slow[i - 1]!) ups++;
    const entries = run.value.orders.filter((row: { options?: { entry?: boolean } }) => row.options?.entry);
    expect(entries.length).toBe(ups);
    expect(entries[0]).toMatchObject({ side: 'buy', quantity: 3, options: { id: 'Long', entry: true, type: 'market' } });
    expect(importPineScript('//@version=5\nstrategy("S")\nplot(close)').kind).toBe('strategy');
  });
  it('unsupported parts become TODO comments and report rows, and the rest still runs', async () => {
    const run = await translateAndRun(`//@version=5
indicator("Mixed")
daily = request.security(syminfo.tickerid, "D", close)
var lbl = label.new(bar_index, high, "x")
arr = array.new_float(0)
plot(close, "Close")
plot(daily, "Daily")
`);
    expect(run.plots.get('Close')).toEqual(close);
    expect(run.plots.get('Daily')!.every(value => value === null)).toBe(true);
    expect(run.source).toMatch(/TODO\(pine\): request\.security\(\)/);
    expect(run.source).toMatch(/TODO\(pine\): not translated: label drawing objects|TODO\(pine\): label\.new\(\)/);
    expect(run.report.unsupported.map(row => row.line)).toEqual(expect.arrayContaining([3, 4, 5]));
  });
});

describe('PINE-IMPORT1 broad subset coverage runs cleanly', { timeout: 120000 }, () => {
  it('a script touching most of the v1 subset translates without TODOs and runs on the demo bars', async () => {
    const run = await translateAndRun(`//@version=5
indicator(title = "Coverage", shorttitle = "COV",
     overlay = false)
len = input.int(14, "Length",
     minval = 2)
src = input(close, "Source")
band(x, n) =>
    basis = ta.ema(x, n)
    dev = ta.stdev(x, n)
    [basis + dev, basis - dev]
[hiBand, loBand] = band(src, len)
varip int ticks = 0
ticks += 1
ph = ta.pivothigh(3, 3)
top = ta.highest(10)
bottom = ta.lowest(low, 10)
[plusDI, minusDI, adx] = ta.dmi(14, 14)
[st, dir] = ta.supertrend(3, 10)
vw = ta.vwap
rounded = math.round(src * 1.2345, 2)
cciValue = ta.cci(hlc3, 20)
momentum = ta.mom(close, 10) + ta.roc(close, 10) - ta.change(close)
wave = math.sin(bar_index / 5.0) * math.sqrt(math.abs(momentum))
count = 0
i = 0
while i < 3
    count += 1
    i += 1
label = dayofweek == dayofweek.monday ? "Mon " + str.tostring(rounded, "#.##") : "Day"
shade = color.from_gradient(nz(cciValue), -100, 100, color.red, color.green)
state = if cciValue > 100
    2
else if cciValue < -100
    -2
else
    0
plot(hiBand, "Hi band", display = display.none)
plot(loBand, "Lo band")
plot(int(top - bottom), "Range", color = shade)
plot(ph, "Pivot", style = plot.style_circles)
plot(adx, "ADX")
plot(dir, "Direction")
plot(vw, "VWAP")
plot(wave, "Wave")
plot(state + count, "State")
plot(time / 1000 - time[1] / 1000, "Gap")
plot(barstate.islast ? 1 : 0, "Last")
plot(ticks, "Ticks")
plotarrow(momentum, "Arrows")
bgcolor(label == "Day" ? na : color.new(color.yellow, 90))
`);
    expect(run.report.unsupported, JSON.stringify(run.report.unsupported)).toEqual([]);
    expect(run.report.errors).toEqual([]);
    expect(run.plots.get('Ticks')!.at(-1)).toBe(demo.length);
    expect(run.plots.get('Last')!.at(-1)).toBe(1);
    expect(run.plots.get('State')!.filter(value => value !== null).every(value => [1, 3, 5].includes(value!))).toBe(true);
    expect(run.plots.get('Gap')!.slice(1).every(value => value === null || value >= 86400)).toBe(true);
    close6(run.plots.get('Lo band'), (() => { const e = ema(close, 14), d = bollingerBands(close, 14, 1); return e.map((v, i) => v === null || d.upper[i] === null ? null : v - (d.upper[i]! - d.basis[i]!)); })());
  });
});
