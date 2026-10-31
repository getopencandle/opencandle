// Original OpenCandle LVScript sources for the built-in strategies.
// Written for OpenCandle from textbook trading rules. They are not Pine Script and copy no third-party source. Every rule,
// input and default here is our own choice.
//
// Execution model shared by every source:
// - Orders are virtual proposals. A market entry made at a bar's close fills at the next bar's open in the Strategy report.
// - Entries use the order option `entry: true` (src/domain/strategy.ts): a long entry while short reverses the position at
//   its fill, and an entry in the direction of a position already at the pyramiding limit is not placed.
// - Each source keeps a record of its position (`ctx.state.pos`), so it sends an order only when the wanted position
//   changes. That keeps the output small (a run may emit at most 512 KiB). In the Strategy tester
//   `ctx.strategy` is the engine's actual position, and the record follows it (`held`), so a rejected entry (for example
//   insufficient virtual equity) or a fill moved by "Process orders on close" no longer leaves the two apart. Where no
//   engine position exists (ctx.strategy is null: an alert run, or the first pass), the record is the script's own.
// - Stop-entry sources (Pivot reversal, ADX breakout) work out which of their own stops the bar reached,
//   in the report's route order (open, the nearer extreme, the other extreme, close), so they know the resulting position.
//   That holds with "Process orders on close" off, the default.

/** Order size input shared by every built-in. Entries and closes use it; a reversal adds the open units. */
const QTY = `qty: { type: 'float', default: 1, min: 0.00000001, title: 'Order size (units)' }`;
/** The shared entry helpers: `go(ctx, 1)` wants a long position, `go(ctx, -1)` a short one, `flat(ctx)` none. */
const MARKET = `const held = ctx => { if (ctx.strategy) ctx.state.pos = Math.sign(ctx.strategy.position); return ctx.state.pos; };
  const go = (ctx, side) => {
    if (held(ctx) === side) return;
    ctx.order(side > 0 ? 'buy' : 'sell', ctx.input('qty'), { id: side > 0 ? 'Long' : 'Short', entry: true });
    ctx.state.pos = side;
  };
  const flat = ctx => {
    if (held(ctx) === 0) return;
    ctx.order(ctx.state.pos > 0 ? 'sell' : 'buy', ctx.input('qty'), { id: 'Close', close: true });
    ctx.state.pos = 0;
  };
  const signal = (ctx, long, short) => { if (long && !short) go(ctx, 1); else if (short && !long) go(ctx, -1); };`;
/**
 * Stop-and-reverse entries. `reached` finds where on the bar's route a stop triggers (0 at the open, 1 to 3 on a segment),
 * as the Strategy report's OHLC route does; `stopHits` applies this bar's hits to the position record; `placeStops` keeps
 * a buy stop working while not long and a sell stop while not short, sending one only when its level changes.
 */
const STOPS = `const route = bar => Math.abs(bar.open - bar.high) < Math.abs(bar.open - bar.low)
    ? [bar.open, bar.high, bar.low, bar.close] : [bar.open, bar.low, bar.high, bar.close];
  const reached = (path, buy, level) => {
    if (buy ? path[0] >= level : path[0] <= level) return 0;
    for (let j = 1; j < path.length; j++) {
      const a = path[j - 1], b = path[j];
      if (buy ? b > a && level > a && level <= b : b < a && level < a && level >= b) return j;
    }
    return -1;
  };
  const stopHits = ctx => {
    const s = ctx.state, path = route(ctx.bar), hits = [];
    if (s.buy !== null) { const at = reached(path, true, s.buy); if (at >= 0) hits.push([at, 1]); }
    if (s.sell !== null) { const at = reached(path, false, s.sell); if (at >= 0) hits.push([at, -1]); }
    hits.sort((x, y) => x[0] - y[0]);
    const seen = { long: false, short: false };
    for (const hit of hits) { s.pos = hit[1]; if (hit[1] > 0) { s.buy = null; seen.long = true; } else { s.sell = null; seen.short = true; } }
    if (ctx.strategy) s.pos = Math.sign(ctx.strategy.position);
    return seen;
  };
  const usable = level => level !== null && isFinite(level) && level > 0 ? level : null;
  const placeStops = (ctx, longLevel, shortLevel) => {
    const s = ctx.state, buy = s.pos !== 1 ? usable(longLevel) : null, sell = s.pos !== -1 ? usable(shortLevel) : null;
    if (buy !== s.buy) { if (buy === null) ctx.cancel('Long'); else ctx.order('buy', ctx.input('qty'), { id: 'Long', type: 'stop', stop: buy, entry: true }); s.buy = buy; }
    if (sell !== s.sell) { if (sell === null) ctx.cancel('Short'); else ctx.order('sell', ctx.input('qty'), { id: 'Short', type: 'stop', stop: sell, entry: true }); s.sell = sell; }
  };`;

interface SourceParts { title: string; rule: string; inputs: string[]; helpers: string; init?: string; body: string }
function compose(parts: SourceParts): string {
  const inputs = [...parts.inputs, QTY].map(row => '      ' + row).join(',\n');
  const init = parts.init ? `\n    init(ctx) {\n      ${parts.init}\n    },` : '';
  return `(() => {
  // ${parts.title}: original CandleScript, not Pine Script. OpenCandle-defined rule: ${parts.rule}
  ${parts.helpers}
  return {
    inputs: {
${inputs}
    },${init}
    onBar(ctx) {
      ${parts.body.trim().split('\n').join('\n      ')}
    }
  };
})()`;
}
const marketInit = 'ctx.state.pos = 0;';
const stopInit = 'ctx.state.pos = 0; ctx.state.buy = null; ctx.state.sell = null;';
const int = (name: string, value: number, title: string, min = 1, max = 500) => `${name}: { type: 'int', default: ${value}, min: ${min}, max: ${max}, title: '${title}' }`;
const float = (name: string, value: number, title: string, min: number, max: number, step: number) => `${name}: { type: 'float', default: ${value}, min: ${min}, max: ${max}, step: ${step}, title: '${title}' }`;
const market = (title: string, rule: string, inputs: string[], body: string, init = marketInit) => compose({ title, rule, inputs, helpers: MARKET, init, body });

/** Built-in strategy id to its LVScript source. */
export const BUILTIN_STRATEGY_SOURCES: Readonly<Record<string, string>> = Object.freeze({
  'bar-up-down': market('Bar up/down strategy', 'long after an up bar that closes above its open and above the prior high; short after a down bar that closes below its open and below the prior low.', [], `
const prior = ctx.history(1);
if (prior === null) return;
const bar = ctx.bar;
signal(ctx, bar.close > bar.open && bar.close > prior.high, bar.close < bar.open && bar.close < prior.low);`),

  'bollinger-bands': market('Bollinger Bands strategy', 'long when the close crosses back above the lower band; short when it crosses back below the upper band.', [int('length', 20, 'Length', 2), float('mult', 2, 'Standard deviations', 0.001, 50, 0.1)], `
const bands = ctx.ta.bb('bb', ctx.bar.close, ctx.input('length'), ctx.input('mult'));
const long = ctx.ta.crossover('long', ctx.bar.close, bands.lower), short = ctx.ta.crossunder('short', ctx.bar.close, bands.upper);
signal(ctx, long, short);`),

  'bollinger-bands-directed': market('Bollinger Bands strategy directed', 'the Bollinger Bands rule with a direction choice; a signal against the allowed direction closes the open position instead of reversing it.', [int('length', 20, 'Length', 2), float('mult', 2, 'Standard deviations', 0.001, 50, 0.1), `direction: { type: 'string', default: 'All', options: ['All', 'Long only', 'Short only'], title: 'Strategy direction' }`], `
const bands = ctx.ta.bb('bb', ctx.bar.close, ctx.input('length'), ctx.input('mult'));
const long = ctx.ta.crossover('long', ctx.bar.close, bands.lower), short = ctx.ta.crossunder('short', ctx.bar.close, bands.upper);
const direction = ctx.input('direction');
if (long && !short) { if (direction === 'Short only') { if (held(ctx) < 0) flat(ctx); } else go(ctx, 1); }
else if (short && !long) { if (direction === 'Long only') { if (held(ctx) > 0) flat(ctx); } else go(ctx, -1); }`),

  'channel-breakout': market('Channel breakout strategy', 'long when the close ends above the highest high of the prior N bars; short when it ends below their lowest low (a closing breakout of the channel).', [int('length', 20, 'Length', 1)], `
const n = ctx.input('length');
const high = ctx.series('high', ctx.ta.highest('high', ctx.bar.high, n), 1)(1), low = ctx.series('low', ctx.ta.lowest('low', ctx.bar.low, n), 1)(1);
signal(ctx, high !== null && ctx.bar.close > high, low !== null && ctx.bar.close < low);`),

  'consecutive-up-down': market('Consecutive up/down strategy', 'long after N closes in a row each above the prior close; short after M closes in a row each below it.', [int('up', 3, 'Consecutive bars up', 1, 100), int('down', 3, 'Consecutive bars down', 1, 100)], `
const prior = ctx.history(1);
if (prior === null) return;
ctx.state.ups = ctx.bar.close > prior.close ? ctx.state.ups + 1 : 0;
ctx.state.downs = ctx.bar.close < prior.close ? ctx.state.downs + 1 : 0;
signal(ctx, ctx.state.ups >= ctx.input('up'), ctx.state.downs >= ctx.input('down'));`, 'ctx.state.pos = 0; ctx.state.ups = 0; ctx.state.downs = 0;'),

  'greedy': market('Greedy strategy', 'follows opening gaps: long after a bar opens above the prior high and closes above its open; short after a bar opens below the prior low and closes below its open.', [], `
const prior = ctx.history(1);
if (prior === null) return;
const bar = ctx.bar;
signal(ctx, bar.open > prior.high && bar.close > bar.open, bar.open < prior.low && bar.close < bar.open);`),

  'inside-bar': market('Inside bar strategy', 'after an inside bar (a high below the prior high and a low above the prior low), long if it closed above its open, short if it closed below.', [], `
const prior = ctx.history(1);
if (prior === null) return;
const bar = ctx.bar, inside = bar.high < prior.high && bar.low > prior.low;
signal(ctx, inside && bar.close > bar.open, inside && bar.close < bar.open);`),

  'keltner-channels': market('Keltner channels strategy', 'long when the close crosses above the upper channel; short when it crosses below the lower channel (EMA basis, EMA of the true range).', [int('length', 20, 'Length', 1), float('mult', 2, 'Multiplier', 0.001, 50, 0.1)], `
const channel = ctx.ta.kc('kc', ctx.bar.close, ctx.input('length'), ctx.input('mult'), true);
signal(ctx, ctx.ta.crossover('long', ctx.bar.close, channel.upper), ctx.ta.crossunder('short', ctx.bar.close, channel.lower));`),

  'macd': market('MACD strategy', 'long when the MACD line crosses above its signal line; short when it crosses below.', [int('fast', 12, 'Fast length'), int('slow', 26, 'Slow length'), int('signal', 9, 'Signal length')], `
const m = ctx.ta.macd('macd', ctx.bar.close, ctx.input('fast'), ctx.input('slow'), ctx.input('signal'));
signal(ctx, ctx.ta.crossover('long', m.macd, m.signal), ctx.ta.crossunder('short', m.macd, m.signal));`),

  'momentum': market('Momentum strategy', 'long when momentum (the close minus the close N bars back) crosses above zero; short when it crosses below zero.', [int('length', 12, 'Length', 1)], `
const mom = ctx.ta.mom('mom', ctx.bar.close, ctx.input('length'));
signal(ctx, ctx.ta.crossover('long', mom, 0), ctx.ta.crossunder('short', mom, 0));`),

  'moving-average-crossover': market('Moving average crossover', 'long when the close crosses above its simple moving average; short when it crosses below.', [int('length', 9, 'Length', 1)], `
const average = ctx.ta.sma('ma', ctx.bar.close, ctx.input('length'));
signal(ctx, ctx.ta.crossover('long', ctx.bar.close, average), ctx.ta.crossunder('short', ctx.bar.close, average));`),

  'outside-bar': market('Outside bar strategy', 'after an outside bar (a high above the prior high and a low below the prior low), long if it closed above its open, short if it closed below.', [], `
const prior = ctx.history(1);
if (prior === null) return;
const bar = ctx.bar, outside = bar.high > prior.high && bar.low < prior.low;
signal(ctx, outside && bar.close > bar.open, outside && bar.close < bar.open);`),

  'parabolic-sar': market('Parabolic SAR strategy', 'Wilder parabolic stop and reverse; when the bar reaches the SAR the trend flips, and the position follows at the next open.', [float('start', 0.02, 'Start', 0.001, 1, 0.01), float('increment', 0.02, 'Increment', 0.001, 1, 0.01), float('maximum', 0.2, 'Maximum', 0.001, 1, 0.01)], `
const bar = ctx.bar, prior = ctx.history(1), s = ctx.state;
if (prior === null) return;
const start = ctx.input('start'), step = ctx.input('increment'), cap = ctx.input('maximum');
let flipped = 0;
if (s.trend === 0) {
  s.trend = bar.close >= prior.close ? 1 : -1;
  s.sar = s.trend > 0 ? Math.min(bar.low, prior.low) : Math.max(bar.high, prior.high);
  s.ep = s.trend > 0 ? Math.max(bar.high, prior.high) : Math.min(bar.low, prior.low);
  s.af = start;
} else {
  const level = s.next;
  if (s.trend > 0 ? bar.low <= level : bar.high >= level) {
    s.trend = -s.trend; s.sar = s.ep; s.ep = s.trend > 0 ? bar.high : bar.low; s.af = start; flipped = s.trend;
  } else {
    s.sar = level;
    if (s.trend > 0 ? bar.high > s.ep : bar.low < s.ep) { s.ep = s.trend > 0 ? bar.high : bar.low; s.af = Math.min(s.af + step, cap); }
  }
}
const next = s.sar + s.af * (s.ep - s.sar);
s.next = s.trend > 0 ? Math.min(next, bar.low, prior.low) : Math.max(next, bar.high, prior.high);
if (flipped) go(ctx, flipped);`, 'ctx.state.pos = 0; ctx.state.trend = 0; ctx.state.sar = 0; ctx.state.ep = 0; ctx.state.af = 0; ctx.state.next = 0;'),

  'pivot-extension': market('Pivot extension strategy', 'fades confirmed pivots: short when a pivot high is confirmed, long when a pivot low is confirmed (left and right bar counts).', [int('left', 4, 'Pivot lookback left', 1, 100), int('right', 2, 'Pivot lookback right', 1, 100)], `
const high = ctx.ta.pivothigh('ph', ctx.bar.high, ctx.input('left'), ctx.input('right'));
const low = ctx.ta.pivotlow('pl', ctx.bar.low, ctx.input('left'), ctx.input('right'));
signal(ctx, low !== null, high !== null);`),

  'pivot-reversal': compose({ title: 'Pivot reversal strategy', rule: 'a buy stop at the latest confirmed pivot high and a sell stop at the latest confirmed pivot low; a pivot level is used once.', inputs: [int('left', 4, 'Pivot lookback left', 1, 100), int('right', 2, 'Pivot lookback right', 1, 100)], helpers: STOPS, init: stopInit + ' ctx.state.high = null; ctx.state.low = null;', body: `
const hits = stopHits(ctx), s = ctx.state;
if (hits.long) s.high = null;
if (hits.short) s.low = null;
const high = ctx.ta.pivothigh('ph', ctx.bar.high, ctx.input('left'), ctx.input('right'));
const low = ctx.ta.pivotlow('pl', ctx.bar.low, ctx.input('left'), ctx.input('right'));
if (high !== null) s.high = high;
if (low !== null) s.low = low;
placeStops(ctx, s.high, s.low);` }),

  'price-channel': market('Price channel strategy', 'the price channel of the prior N bars (highest high and lowest low) and its middle line; long when the close crosses above the middle, short when it crosses below.', [int('length', 20, 'Length', 1)], `
const n = ctx.input('length');
const high = ctx.series('high', ctx.ta.highest('high', ctx.bar.high, n), 1)(1), low = ctx.series('low', ctx.ta.lowest('low', ctx.bar.low, n), 1)(1);
const middle = high !== null && low !== null ? (high + low) / 2 : null;
signal(ctx, ctx.ta.crossover('long', ctx.bar.close, middle), ctx.ta.crossunder('short', ctx.bar.close, middle));`),

  'rob-booker-adx-breakout': compose({ title: 'Rob Booker - ADX Breakout', rule: 'while ADX is below its threshold the market is consolidating: a buy stop at the box high and a sell stop at the box low of the last N bars; at or above the threshold no new stop is kept.', inputs: [int('adxLength', 14, 'ADX length', 1, 200), float('threshold', 18, 'ADX threshold', 0, 100, 1), int('box', 20, 'Box length', 1)], helpers: STOPS, init: stopInit, body: `
stopHits(ctx);
const adx = ctx.ta.dmi('dmi', ctx.input('adxLength'), ctx.input('adxLength')).adx;
const n = ctx.input('box'), high = ctx.ta.highest('high', ctx.bar.high, n), low = ctx.ta.lowest('low', ctx.bar.low, n);
const quiet = adx !== null && adx < ctx.input('threshold');
placeStops(ctx, quiet ? high : null, quiet ? low : null);` }),

  'rsi': market('RSI strategy', 'long when RSI crosses above the oversold level; short when it crosses below the overbought level.', [int('length', 14, 'RSI length', 2), float('overbought', 70, 'Overbought', 0, 100, 1), float('oversold', 30, 'Oversold', 0, 100, 1)], `
const rsi = ctx.ta.rsi('rsi', ctx.bar.close, ctx.input('length'));
signal(ctx, ctx.ta.crossover('long', rsi, ctx.input('oversold')), ctx.ta.crossunder('short', rsi, ctx.input('overbought')));`),

  'stochastic-slow': market('Stochastic slow strategy', 'slow %K (raw stochastic smoothed) against its %D; long when %K crosses above %D below the oversold level, short when it crosses below %D above the overbought level.', [int('length', 14, '%K length', 1), int('smoothK', 3, '%K smoothing', 1, 100), int('smoothD', 3, '%D smoothing', 1, 100), float('overbought', 80, 'Overbought', 0, 100, 1), float('oversold', 20, 'Oversold', 0, 100, 1)], `
const raw = ctx.ta.stoch('stoch', ctx.bar.close, ctx.bar.high, ctx.bar.low, ctx.input('length'));
const k = ctx.ta.sma('k', raw, ctx.input('smoothK')), d = ctx.ta.sma('d', k, ctx.input('smoothD'));
const up = ctx.ta.crossover('long', k, d), down = ctx.ta.crossunder('short', k, d);
signal(ctx, up && k < ctx.input('oversold'), down && k > ctx.input('overbought'));`),

  'supertrend': market('Supertrend strategy', 'an ATR band around the bar midpoint that only tightens; long when the close ends above the upper band, short when it ends below the lower band.', [int('atrLength', 10, 'ATR length', 1, 200), float('factor', 3, 'Factor', 0.01, 50, 0.1)], `
const atr = ctx.ta.atr('atr', ctx.input('atrLength'));
const bar = ctx.bar, prior = ctx.history(1), s = ctx.state;
if (atr === null) return;
const middle = (bar.high + bar.low) / 2, upper = middle + ctx.input('factor') * atr, lower = middle - ctx.input('factor') * atr;
if (s.upper === null) { s.upper = upper; s.lower = lower; }
else {
  s.upper = upper < s.upper || prior.close > s.upper ? upper : s.upper;
  s.lower = lower > s.lower || prior.close < s.lower ? lower : s.lower;
}
const trend = bar.close > s.upper ? 1 : bar.close < s.lower ? -1 : s.trend;
if (trend !== s.trend && trend !== 0) go(ctx, trend);
s.trend = trend;`, 'ctx.state.pos = 0; ctx.state.upper = null; ctx.state.lower = null; ctx.state.trend = 0;'),

  'technical-ratings': market('Technical ratings strategy', 'a rating from -1 to 1, the mean of a moving-average vote (the close against SMA 20 and EMA 50) and an oscillator vote (RSI 14 turning from below 30 or above 70, MACD 12, 26, 9 against its signal, momentum 10 rising or falling); long when it crosses above the threshold, short when it crosses below minus the threshold.', [float('threshold', 0.1, 'Signal threshold', 0, 1, 0.05)], `
const close = ctx.bar.close, s = ctx.state, votes = [], oscillators = [];
for (const average of [ctx.ta.sma('sma', close, 20), ctx.ta.ema('ema', close, 50)]) if (average !== null) votes.push(close > average ? 1 : close < average ? -1 : 0);
const rsi = ctx.ta.rsi('rsi', close, 14), m = ctx.ta.macd('macd', close, 12, 26, 9), mom = ctx.ta.mom('mom', close, 10);
if (rsi !== null && s.rsi !== null) oscillators.push(rsi < 30 && rsi > s.rsi ? 1 : rsi > 70 && rsi < s.rsi ? -1 : 0);
if (m.macd !== null && m.signal !== null) oscillators.push(m.macd > m.signal ? 1 : m.macd < m.signal ? -1 : 0);
if (mom !== null && s.mom !== null) oscillators.push(mom > s.mom ? 1 : mom < s.mom ? -1 : 0);
s.rsi = rsi; s.mom = mom;
const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length;
const rating = votes.length && oscillators.length ? (mean(votes) + mean(oscillators)) / 2 : null, threshold = ctx.input('threshold'), prior = s.rating;
s.rating = rating;
if (rating === null || prior === null) return;
signal(ctx, rating > threshold && prior <= threshold, rating < -threshold && prior >= -threshold);`, 'ctx.state.pos = 0; ctx.state.rsi = null; ctx.state.mom = null; ctx.state.rating = null;'),

  'two-moving-averages-crossover': market('Two moving averages crossover', 'long when the fast simple moving average crosses above the slow one; short when it crosses below.', [int('fast', 9, 'Fast length', 1), int('slow', 21, 'Slow length', 1)], `
const fast = ctx.ta.sma('fast', ctx.bar.close, ctx.input('fast')), slow = ctx.ta.sma('slow', ctx.bar.close, ctx.input('slow'));
signal(ctx, ctx.ta.crossover('long', fast, slow), ctx.ta.crossunder('short', fast, slow));`),

  'volatility-expansion-close': market('Volatility expansion-close strategy', 'long when the close rises above the prior close by more than a multiple of the average true range of the last N bars; short when it falls below the prior close by more than that.', [int('length', 5, 'Length', 1, 200), float('mult', 0.75, 'Range multiplier', 0.01, 50, 0.05)], `
const range = ctx.ta.sma('range', ctx.ta.tr(true), ctx.input('length'));
const prior = ctx.history(1);
if (prior === null || range === null) return;
const reach = ctx.input('mult') * range;
signal(ctx, ctx.bar.close - prior.close > reach, prior.close - ctx.bar.close > reach);`),
});
