// Mapping tables from the common Pine Script v5/v6 built-ins to LVScript. Parameter names follow the
// public Pine reference vocabulary (general public knowledge); the LV side names the documented ctx.ta functions in
// docs/candlescript.md and electron/script-ta.cjs. Colours are our own approximations in LV's own palette, not copies of
// any reference palette.

/** One Pine ta.* function mapped to a keyed ctx.ta function. */
export interface TaSpec {
  /** Pine parameter names in positional order. */
  params: string[];
  /** LV ctx.ta function name. */
  lv: string;
  /** LV argument order after the key (Pine parameter names). */
  args: string[];
  /** Values used when a Pine parameter is omitted but a later LV argument is given. */
  defaults?: Record<string, string>;
  /** Defaults applied when the call has exactly this many positional arguments (the short overloads). */
  short?: { count: number; fill: Record<string, string>; shift: string[] };
  /** Tuple result: LV object fields in Pine tuple order. */
  tuple?: string[];
  /** Result type. */
  type?: 'num' | 'bool';
  /** Arguments that must be booleans. */
  bools?: string[];
  /** No series key (stateless LV function). */
  keyless?: boolean;
}

const s = (lv: string, params: string[], extra: Partial<TaSpec> = {}): TaSpec => ({ params, lv, args: params, ...extra });
const SL = ['source', 'length'];
export const TA: Readonly<Record<string, TaSpec>> = Object.freeze({
  sma: s('sma', SL), ema: s('ema', SL), rma: s('rma', SL), wma: s('wma', SL), vwma: s('vwma', SL), hma: s('hma', SL),
  swma: s('swma', ['source']),
  alma: s('alma', ['series', 'length', 'offset', 'sigma', 'floor'], { defaults: { offset: '0.85', sigma: '6', floor: 'false' }, bools: ['floor'] }),
  linreg: s('linreg', ['source', 'length', 'offset'], { defaults: { offset: '0' } }),
  rsi: s('rsi', SL), cci: s('cci', SL), mom: s('mom', SL), roc: s('roc', SL), cmo: s('cmo', ['series', 'length']),
  change: s('change', SL, { defaults: { length: '1' } }),
  stdev: s('stdev', ['source', 'length', 'biased'], { defaults: { biased: 'true' }, bools: ['biased'] }),
  variance: s('variance', ['source', 'length', 'biased'], { defaults: { biased: 'true' }, bools: ['biased'] }),
  dev: s('dev', SL), median: s('median', SL), mode: s('mode', SL), range: s('range', SL), percentrank: s('percentrank', SL), cog: s('cog', SL),
  percentile_linear_interpolation: s('percentile_linear_interpolation', ['source', 'length', 'percentage']),
  percentile_nearest_rank: s('percentile_nearest_rank', ['source', 'length', 'percentage']),
  tsi: s('tsi', ['source', 'short_length', 'long_length']),
  mfi: s('mfi', ['series', 'length']), wpr: s('wpr', ['length']),
  highest: s('highest', SL, { short: { count: 1, fill: { source: 'ctx.bar.high' }, shift: ['length'] } }),
  lowest: s('lowest', SL, { short: { count: 1, fill: { source: 'ctx.bar.low' }, shift: ['length'] } }),
  highestbars: s('highestbars', SL, { short: { count: 1, fill: { source: 'ctx.bar.high' }, shift: ['length'] } }),
  lowestbars: s('lowestbars', SL, { short: { count: 1, fill: { source: 'ctx.bar.low' }, shift: ['length'] } }),
  crossover: s('crossover', ['source1', 'source2'], { type: 'bool' }), crossunder: s('crossunder', ['source1', 'source2'], { type: 'bool' }),
  cross: s('cross', ['source1', 'source2'], { type: 'bool' }),
  rising: s('rising', SL, { type: 'bool' }), falling: s('falling', SL, { type: 'bool' }),
  cum: s('cum', ['source']), max: s('max', ['source']), min: s('min', ['source']),
  barssince: s('barssince', ['condition'], { bools: ['condition'] }),
  valuewhen: s('valuewhen', ['condition', 'source', 'occurrence'], { defaults: { occurrence: '0' }, bools: ['condition'] }),
  correlation: s('correlation', ['source1', 'source2', 'length']),
  atr: s('atr', ['length']),
  tr: s('tr', ['handle_na'], { keyless: true, bools: ['handle_na'] }),
  stoch: s('stoch', ['source', 'high', 'low', 'length']),
  bb: s('bb', ['series', 'length', 'mult'], { tuple: ['basis', 'upper', 'lower'] }),
  bbw: s('bbw', ['series', 'length', 'mult']),
  kc: s('kc', ['series', 'length', 'mult', 'useTrueRange'], { tuple: ['basis', 'upper', 'lower'], defaults: { useTrueRange: 'true' }, bools: ['useTrueRange'] }),
  kcw: s('kcw', ['series', 'length', 'mult', 'useTrueRange'], { defaults: { useTrueRange: 'true' }, bools: ['useTrueRange'] }),
  macd: s('macd', ['source', 'fastlen', 'slowlen', 'siglen'], { tuple: ['macd', 'signal', 'histogram'] }),
  dmi: s('dmi', ['diLength', 'adxSmoothing'], { tuple: ['plusDI', 'minusDI', 'adx'] }),
  supertrend: s('supertrend', ['factor', 'atrPeriod'], { tuple: ['value', 'direction'] }),
  sar: s('sar', ['start', 'inc', 'max']),
  pivothigh: s('pivothigh', ['source', 'leftbars', 'rightbars'], { short: { count: 2, fill: { source: 'ctx.bar.high' }, shift: ['leftbars', 'rightbars'] } }),
  pivotlow: s('pivotlow', ['source', 'leftbars', 'rightbars'], { short: { count: 2, fill: { source: 'ctx.bar.low' }, shift: ['leftbars', 'rightbars'] } }),
});
/** ta.* built-in variables (no call) to LV calls. 'key' marks a keyed function. */
export const TA_VARIABLES: Readonly<Record<string, { lv: string; key: boolean }>> = Object.freeze({
  tr: { lv: 'tr(false)', key: false }, obv: { lv: 'obv', key: true }, accdist: { lv: 'accdist', key: true }, pvt: { lv: 'pvt', key: true },
  wad: { lv: 'wad', key: true }, nvi: { lv: 'nvi', key: true }, pvi: { lv: 'pvi', key: true }, iii: { lv: 'iii()', key: false }, wvad: { lv: 'wvad()', key: false },
});

/** math.* one-argument functions: JS function expression and whether a finite input always gives a finite result. */
export const MATH_UNARY: Readonly<Record<string, { fn: string; total: boolean }>> = Object.freeze({
  abs: { fn: 'Math.abs', total: true }, ceil: { fn: 'Math.ceil', total: true }, floor: { fn: 'Math.floor', total: true }, sign: { fn: 'Math.sign', total: true },
  sqrt: { fn: 'Math.sqrt', total: false }, exp: { fn: 'Math.exp', total: false }, log: { fn: 'Math.log', total: false }, log10: { fn: 'Math.log10', total: false },
  sin: { fn: 'Math.sin', total: true }, cos: { fn: 'Math.cos', total: true }, tan: { fn: 'Math.tan', total: false },
  asin: { fn: 'Math.asin', total: false }, acos: { fn: 'Math.acos', total: false }, atan: { fn: 'Math.atan', total: true },
  todegrees: { fn: '(x => x * 180 / Math.PI)', total: true }, toradians: { fn: '(x => x * Math.PI / 180)', total: true },
});
export const MATH_CONSTANTS: Readonly<Record<string, string>> = Object.freeze({ pi: 'Math.PI', e: 'Math.E', phi: '1.618033988749895', rphi: '0.618033988749895' });

/** Pine colour constants to our own palette colours (own values, chosen by hue). */
export const PINE_COLORS: Readonly<Record<string, string>> = Object.freeze({
  aqua: '#4fc3d9', black: '#1c1f26', blue: '#6fa8ff', fuchsia: '#d46fd8', gray: '#8a93a0', green: '#3fb68b', lime: '#8bd46a', maroon: '#8c3a45',
  navy: '#2f4f8f', olive: '#8c8c3a', orange: '#f0a35e', purple: '#9a6fd8', red: '#e5566b', silver: '#b8bec7', teal: '#2f9e8f', white: '#f2f4f7', yellow: '#e8d25a',
});
/** LV plot colours used, in turn, for plots without a colour. */
export const LV_SERIES_COLORS = Object.freeze(['#6fa8ff', '#f0a35e', '#3fb68b', '#e5566b', '#b38cff', '#50b4c7', '#e0c35a', '#9aa4b1']);

/** Pine named constants used as option values, to their LV option names. */
export const PINE_CONSTANTS: Readonly<Record<string, string>> = Object.freeze({
  'plot.style_line': 'line', 'plot.style_linebr': 'linebr', 'plot.style_stepline': 'stepline', 'plot.style_steplinebr': 'stepline', 'plot.style_stepline_diamond': 'stepline',
  'plot.style_histogram': 'histogram', 'plot.style_columns': 'columns', 'plot.style_circles': 'circles', 'plot.style_cross': 'cross', 'plot.style_area': 'area', 'plot.style_areabr': 'areabr',
  'hline.style_solid': 'solid', 'hline.style_dashed': 'dashed', 'hline.style_dotted': 'dotted',
  'shape.xcross': 'xcross', 'shape.cross': 'cross', 'shape.circle': 'circle', 'shape.triangleup': 'triangleup', 'shape.triangledown': 'triangledown', 'shape.flag': 'flag',
  'shape.arrowup': 'arrowup', 'shape.arrowdown': 'arrowdown', 'shape.square': 'square', 'shape.diamond': 'diamond', 'shape.labelup': 'triangleup', 'shape.labeldown': 'triangledown',
  'location.abovebar': 'abovebar', 'location.belowbar': 'belowbar', 'location.top': 'top', 'location.bottom': 'bottom', 'location.absolute': 'abovebar',
  'size.tiny': 'tiny', 'size.small': 'small', 'size.normal': 'normal', 'size.large': 'large', 'size.huge': 'huge', 'size.auto': 'small',
  'display.all': 'all', 'display.none': 'none', 'display.pane': 'pane', 'display.data_window': 'data_window', 'display.status_line': 'status_line', 'display.price_scale': 'price_scale',
  'strategy.long': 'long', 'strategy.short': 'short',
  'format.price': 'price', 'format.percent': 'percent', 'format.volume': 'volume', 'format.inherit': 'inherit', 'format.mintick': 'mintick',
  'scale.right': 'right', 'scale.left': 'left', 'scale.none': 'none',
  'strategy.fixed': 'fixed', 'strategy.cash': 'cash', 'strategy.percent_of_equity': 'percent_of_equity',
  'alert.freq_once_per_bar': 'once_per_bar', 'alert.freq_once_per_bar_close': 'once_per_bar_close', 'alert.freq_all': 'all',
});
/** Constants that are approximated (the report notes them). */
export const APPROXIMATED_CONSTANTS: Readonly<Record<string, string>> = Object.freeze({
  'shape.labelup': 'shape.labelup is drawn as an OpenCandle triangleup', 'shape.labeldown': 'shape.labeldown is drawn as an OpenCandle triangledown',
  'location.absolute': 'location.absolute is drawn above the bar', 'size.auto': 'size.auto is drawn at OpenCandle small size',
  'plot.style_steplinebr': 'plot.style_steplinebr is drawn as an OpenCandle stepline', 'plot.style_stepline_diamond': 'plot.style_stepline_diamond is drawn as an OpenCandle stepline',
});

/** Namespaces whose functions are outside the v1 subset, with the reason shown in the report. */
export const UNSUPPORTED_NAMESPACES: Readonly<Record<string, string>> = Object.freeze({
  request: 'other symbols and timeframes (request.*) are not translated in v1; CandleScript declares them with timeframes/symbols instead',
  array: 'arrays are not supported in v1', matrix: 'matrices are not supported in v1', map: 'maps are not supported in v1',
  label: 'labels are not translated in v1 (CandleScript has ctx.label with a different API)', line: 'lines are not translated in v1 (CandleScript has ctx.line with a different API)',
  box: 'boxes are not translated in v1 (CandleScript has ctx.box with a different API)', table: 'tables are not translated in v1 (CandleScript has ctx.table with a different API)',
  linefill: 'linefills are not translated in v1', polyline: 'polylines are not translated in v1', chart: 'chart.* is not supported in v1',
  syminfo: 'symbol information (syminfo.*) is not available to CandleScript', timeframe: 'timeframe.* is not translated in v1', ticker: 'ticker.* is not supported in v1',
  runtime: 'runtime.* is not supported in v1', str: 'this string function is not supported in v1', strategy: 'this strategy function or field is not supported in v1',
  ta: 'this ta.* function is not supported in v1', math: 'this math.* function is not supported in v1', color: 'this color.* function is not supported in v1',
  input: 'this input type is not supported in v1', session: 'session.* is not supported in v1', barmerge: 'barmerge.* is not supported in v1',
});

/** JavaScript words a Pine name may not keep as is. */
export const JS_RESERVED = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'await', 'async', 'arguments', 'eval', 'undefined', 'NaN', 'Infinity', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'JSON', 'Symbol', 'Error', 'Promise', 'Date', 'Function', 'RegExp', 'Map', 'Set', 'isFinite', 'isNaN', 'globalThis', 'S', 'ctx', 'of']);
