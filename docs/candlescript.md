# CandleScript guide

CandleScript is OpenCandle's scripting language for custom indicators, strategies and alert conditions. A script is a JavaScript object with an `onBar` function (and optionally `init`), plus a `ctx` API for prices, technical analysis, plots, drawings, alerts and virtual orders.

Scripts run in a fresh QuickJS 0.32.0 WebAssembly sandbox inside a dedicated worker, with strict limits and no access to files, the network or your keys. Results are deterministic: the same bars and inputs always give the same output.

CandleScript is its own language. It does not run Pine Script; to bring a Pine script over, use the importer described in [pine-import.md](pine-import.md).

## Quick start

1. Open **Script editor** from the main menu.
2. Pick one of the five examples (SMA and close, Persistent range, Moving average band, Moving average cross strategy, Breakout alert condition), or create a new indicator or strategy.
3. Click **Run and add to chart**. The script runs on the chart's bars and appears as an instance you can show, hide, style or remove.
4. Edit the source and click **Run and update on chart** to change the attached instance.

Strategies emit virtual orders that the **Strategy tester** evaluates. No real orders are ever placed.

The rest of this guide is the API reference.

## Bars, state and results

A definition can provide `init(ctx)` and `onBar(ctx)`. Initialization runs once in a committed snapshot. Each bar callback receives an immutable `ctx.bar`, a zero-based processed `ctx.index` and JSON `ctx.state`. Ordinary bars carry `id`, `revision`, Unix-seconds `time`, OHLC and nonnegative `volume`. Only current and preceding observations are accessible. Historical corrections require a snapshot preceding the affected observation; a changed source definition cannot reuse its old snapshot.

Confirmed derived charts use owned logical positions. Distinct confirmed observations can share an event timestamp, so their logical indices distinguish them for calculation and drawing placement. Projected or provisional observations do not become confirmed calculation input. A chart without a qualified current mapping can withhold a script readout rather than guess a position.

A successful result includes `plots`, `alerts`, `orders`, `conditions`, `visuals`, `objects`, `logs`, `declarations`, `inputs`, `state`, `diagnostics`, `elapsedMs`, `provisional` and `provenance`. Plot values contain a timestamp, a number or `null`, and a logical index when applicable. Warmup gaps remain `null`. Plot IDs are opaque handles separate from human titles. Treat the returned state as the complete resumable snapshot; do not edit engine-owned keyed state. Provisional evaluations return the prior snapshot and empty effect outputs. Cancellation produces a structured error without a candidate state or effects.

```javascript
({
  init(ctx) {
    ctx.state.started = true;
  },
  onBar(ctx) {
    const average = ctx.sma('close-sma-3', ctx.bar.close, 3);
    ctx.plot('Close SMA 3', average, '#6fa8ff');
    if (average !== null && ctx.bar.close > average) {
      ctx.alert('above-average', 'Synthetic indicator example');
    }
  }
})
```

`ctx.sma(key, value, length)` keeps a trailing window and returns `null` until it is full. Keep the length fixed for that key. `ctx.random()` uses the snapshotted generator; `Math.random()` is unavailable. `ctx.plot(title, numberOrNull, color)` emits a numeric plot point. `ctx.alert(name, message)` deduplicates an event by its stable observation identity, revision and name. Named boolean series declared with `ctx.alertcondition(...)` can be offered as chart alert conditions.

`ctx.history(n)` returns a preceding immutable bar or `null`, with zero referring to the current bar and a maximum depth of 500. `ctx.history(n, source)` returns one price source of that bar instead (`open`, `high`, `low`, `close`, `hl2`, `hlc3`, `ohlc4` or `hlcc4`), so the previous close is `ctx.history(1, 'close')`. A negative, fractional or too-large `n` is refused; no index reaches a later bar. A bar before the first processed bar is `null`, and a continued run that needs a bar older than its snapshot keeps is refused with a recalculation instruction rather than guessed. `ctx.series(key, value, depth=100)` retains a bounded series of numbers, booleans or nulls, returns an accessor function, called as `savedSeries(n)`; depth is at most 500. Keep each key's parameters and value type consistent.

Up to 32 typed inputs can be declared in the definition's `inputs` field and read with `ctx.input(name)`. Up to four named source requests can be declared in `requests` and read with `ctx.request(name)`. A requested bar is aligned to the current bar using its completed interval; absent data remains unavailable. Resolution and permission belong to the chart's source services. The guest itself cannot fetch data, and a typed symbol or timeframe input does not open a connection.

## Higher timeframes, other symbols and alert conditions

```javascript
({
  timeframes: { day: '1D' },
  symbols: { peer: 'QQQ' },
  conditions: { 'Above prior day high': 'Close is above the previous completed day high' },
  onBar(ctx) {
    const day = ctx.timeframe('day');        // latest completed day, or null
    const peer = ctx.symbol('peer');         // latest completed QQQ bar at the chart interval, or null
    ctx.plot('Prior day high', day ? day.high : null);
    ctx.plot('Peer close', peer ? peer.close : null);
    ctx.alertcondition('Above prior day high', day !== null && ctx.bar.close > day.high);
  }
})
```

`timeframes` declares up to four named intervals (such as `60m`, `4h`, `1D`, `1W` or `1M`). `ctx.timeframe(name, n=0)` returns the latest completed bar of that timeframe (`n = 0`) or the completed bar `n` steps before it, as a frozen `{time, open, high, low, close, volume, end}`, or `null`. The bars are built from the bars the script runs on. A US stock, ETF or index chart quoted in New York uses New York trading sessions, including holidays, early closes and daylight-saving changes; other charts use the UTC calendar policy (UTC day, Monday week, calendar month). A higher-timeframe bar becomes readable on the chart bar that completes it. If that bar is missing, the higher-timeframe bar becomes readable on the first later chart bar, never earlier. A still-developing bar is never returned, so historical and latest values follow one rule. The chart's own interval returns the chart bars; a lower interval or an event interval is refused. Unavailable volume is `null`, not zero.

`symbols` declares up to four other symbols. `ctx.symbol(name, n=0)` returns that symbol's latest bar whose period ended by the end of the current chart bar (or the bar `n` before it), with the same fields, or `null`. Symbols are read only from datasets the app has already loaded, at the chart interval, with the same exact-or-aggregated source rule as requests. If no loaded dataset holds the symbol, the run is refused with an instruction to open, import or compare it. Unlike `requests`, it never opens a data feed. Synthetic loaded data makes the run synthetic.

Both readers reach at most 500 completed bars back, refuse an undeclared name, and work only in `onBar`. The renderer sends each series as completed rows and, for every chart bar, the number of rows complete by that bar's end. The main process refuses a series that would expose a row before it completed. A series is limited to 5,500 rows and all timeframe and symbol series to 20,000 rows. Both readers need a chart with a time interval; derived chart styles have none.

`conditions` declares up to 32 alert conditions, each mapped to its message. Declared conditions appear in the alert dialog in declared order after the script has calculated on the chart, even if no bar has set them yet. Their values stay unavailable, not false, until `ctx.alertcondition(name, true|false)` sets them. For a declared condition the message argument can be omitted; a different message is refused. Undeclared names still register on first use. Alerts created from a script condition, a `ctx.alert` name or a plot run through the ordinary alert observation, with its trigger frequency, expiry and delivery settings, in the same restricted worker on the observed prefix only.

## Visuals, drawing objects and logs

`ctx.hline`, `ctx.fill`, `ctx.bgcolor`, `ctx.plotshape`, `ctx.plotchar` and `ctx.barcolor` create chart output. A fill names its plot endpoints. Plot and visual styles can be saved per attached instance. These outputs are separate from manually editable chart drawings.

`ctx.label`, `ctx.line` and `ctx.box` each expose `new(options)`, `set(id, options)`, `get(id)`, `delete(id)` and `all()`. Labels accept position, text and appearance; lines accept two endpoints and extension; boxes accept edges, border, background and text. Coordinates use `xloc: 'index'` by default, or `xloc: 'time'` for Unix seconds. Index coordinates may extend at most 500 bars beyond the current processed index.

Object handles belong to one run. `set` returns false and `get` returns null for an object deleted or evicted during that run; handles from another run are invalid. Drawing objects are rebuilt by recalculation rather than stored as live handles in a resumable snapshot. Each instance retains 50 labels, 50 lines and 50 boxes by default. An `objectLimits` declaration can set each count from 1 to 500. Creating an object past its retained count evicts the oldest live object of that kind. At most 1,000 objects can be created per bar; object text is limited to 500 characters.

`ctx.table.new({position, columns, rows, ...appearance})` creates an anchored table. `ctx.table.cell(id, column, row, options)` writes a zero-based cell; `clear`, `delete` and `all` manage tables. A table has at most 20 columns and 50 rows. Across an instance, at most nine tables and 500 filled cells are retained.

`ctx.log.info`, `ctx.log.warn` and `ctx.log.error` accept 1 to 16 text, number, boolean or null arguments. The Logs view shows the run's messages. Each message is truncated to 1,000 characters; after 1,000 entries the result counts further dropped messages. Logs are not resumable user state.

## Virtual strategy proposals

`ctx.order('buy'|'sell', positiveQuantity, options?)`, `ctx.exit(name, specification)` and `ctx.cancel(name)` emit virtual proposals. They do not submit real account orders. A separate accounting engine must validate and commit fills.

When the Strategy tester supplies its engine feed, `ctx.strategy` describes the simulated position at the current bar close. An optional `onFill(ctx, fill)` callback runs at the supplied fill, before that bar's `onBar`. It sees the partial bar and position after the fill. Only input reads and order, exit and cancel proposals are available during this callback; TA and visual calls are refused, including calls through a retained bar context. Temporary `ctx.state` changes made in `onFill` are restored afterward.

## Limits and execution boundary

Limits are 64 KiB source, 5,000 bars per request, 16 MiB interpreter heap, 256 KiB interpreter stack, 512 KiB serialized output, 10,000 emitted outputs, one second of interpreter compute and five seconds total worker lifetime. At most two workers remain live, including teardown. The output budget covers the complete result, including provenance. Output and input budget failures reject the run; the explicit object eviction and log truncation rules above still apply. Capacity remains occupied until worker exit.

Snapshots must be bounded, acyclic plain JSON with finite numbers. Serialization reads own data descriptors; executable getters are refused. Async/await/import/export/Promise tokens are conservatively rejected even inside strings or comments. Modules and residual asynchronous jobs are unsupported. Unavailable APIs and unsupported syntax produce structured errors.

The runner captures its required built-ins before compiling the user definition in a separate scope. Date, Promise and Proxy intrinsics are omitted. The host compiles the runner and the user definition, then clears the engine compiler (the Eval intrinsic) before any guest code runs, including definition-time code; every job proves the clear, and a failure stops the job with `ISOLATION_FAILED`. Guest `eval`, `Function` and every constructor route to them therefore fail with `eval is not supported` (they are also removed as names), and basic prototypes are protected. An endless loop stops at the 1-second compute limit (`interrupted`) and a runaway allocation at the 16 MiB heap (`out of memory`), both as ordinary script errors. No filesystem, network, process or credential object is installed in the guest. These are implementation restrictions, not a claim of complete security certification.

## Local documents and chart instances

Open **Script editor** to select or create a local indicator or strategy, load an example, or make a copy. Typing updates the local draft after 250 ms. **Save script** records a changed version; switching documents and closing flush the draft. Ctrl+S saves, Ctrl+Enter runs the selected chart action, and Alt+Z changes wrapping. Font size and wrapping persist; cursor and scroll positions remain local to the editor session. The editor can float or dock in the bottom panel.

**Run and add to chart** saves and executes the source against the chart's supplied observations, then creates a persistent instance with a source/version snapshot. **Run and update on chart** changes that instance's source while retaining its placement, visibility and plot styles. Later library draft edits or deleting its document do not change attached snapshots. Attached instances recalculate for their committed source, style and replay prefix. Saved settings contain source and styles, rather than calculated results. Pending or failed calculation does not silently substitute an empty successful result.

The instance list provides show/hide, remove, placement and plot styles. **Copy attached source to editor** creates a new document; restoring a version changes only the draft. Cancelling a run or removing its instance prevents a pending manual result from reattaching it. An oversized draft can be kept for editing or discarded in favour of the last valid saved draft. A crash can lose typing that has not completed the debounce and workspace save.

Script-library JSON contains `{schemaVersion:1, documents, activeId, recentIds, preferences}`. Documents include source, placement and version history. Native file selection and pasted JSON use the same validation. Imports assign new document IDs and do not execute or attach scripts. The library limit is 8 MiB UTF-8, 100 documents and 100 versions per document, with 64 KiB source per document. Exports use the native Save dialog.

Running Pine Script directly, modules, network access, file access, real trading, and a separate operating-system editor window are outside this API. A function with a familiar name from another language does not imply the same behaviour; the tables below describe what CandleScript does.

## Editor aids

The script editor underlines static problems as you type (the same checks as Compile, never executing the script), completes `ctx.` members, `ctx.ta.` functions and definition keys, and shows signature and summary text on hover. A narrow overview strip beside the text marks errors and warnings; click or drag it to scroll. Ctrl+Shift+P (or the Commands button) opens a command palette: type to filter, Enter to run, or type `:42` to go to line 42. Ctrl+G, Ctrl+F and find/replace work in the editor itself.

## Technical analysis and typed inputs

The functions below operate on supplied observations. A keyed function takes a 1 to 128 character series key first. Keep its parameters fixed; repeated calls on the same bar with the same inputs return its cached value. Stateful TA calls are unavailable during `onFill`. Finite-window functions return `null` before their complete window is available, and missing values keep a window unavailable until the gap leaves it. Arithmetic overflow rejects the run without committing state. The table describes how each function behaves in CandleScript.

| Function after `ctx.ta.` | Behaviour |
| --- | --- |
| `alma(key, value, length, offset=0.85, sigma=6, floor=false)` | Gaussian weighted window, oldest first; center `offset*(length-1)` optionally floored; width `length/sigma`; positive sigma. |
| `dema(key, value, length)`, `tema(key, value, length)` | Two or three nested EMAs, each seeded at its first finite value; `2*e1-e2` and `3*e1-3*e2+e3`. |
| `swma(key, value)` | Four-bar weights 1, 2, 2, 1 divided by six. |
| `linreg(key, value, length, offset=0)` | Least-squares line read at `length-1-offset`; integer offset from -5000 to 5000. A one-bar window returns its value. |
| `vwap(key, value, anchor=false, multiplier?)` | Accumulates price times volume over volume. True anchor resets before the current bar. Without multiplier returns a number or null; with multiplier returns frozen `{vwap,upper,lower}` using volume-weighted population deviation. Zero accumulated volume is unavailable. |
| `wpr(key, length)` | Williams percent range, `100*(close-highestHigh)/(highestHigh-lowestLow)`; a flat range is unavailable. |
| `cmo(key, value, length)` | One hundred times net gains minus losses divided by total movement over `length` changes; no movement is unavailable. |
| `tsi(key, value, shortLength, longLength)` | Ratio of double EMA changes to double EMA absolute changes, long smoothing first. A ratio, not a percentage. |
| `percentrank(key, value, length)` | Percentage of the preceding `length` observations at or below the current value. Requires `length+1` finite observations; maximum length 4999. |
| `cog(key, value, length)` | Negative weighted sum over sum, weight one on newest and length on oldest; zero sum is unavailable. |
| `median(key, value, length)` | Middle sorted value, or average of the middle pair. Uses an engine-private merge sort. |
| `dev(key, value, length)` | Mean absolute deviation around the window mean. |
| `range(key, value, length)` | Highest minus lowest over the window. |
| `percentile_nearest_rank(key, value, length, percentage)` | Sorted rank `ceil(percentage*length/100)`, clamped to the first observation at zero percent. |
| `percentile_linear_interpolation(key, value, length, percentage)` | Inclusive interpolation at `(length-1)*percentage/100`. Both percentile methods accept percentages from zero through one hundred. |
| `max(key, value)`, `min(key, value)` | Running finite extremes; null before the first finite observation, then gaps retain the extreme. |
| `bbw(key, value, length, multiplier=2)` | Bollinger full band width divided by SMA basis, population deviation. Returns a ratio, not a percentage; zero basis is unavailable. |
| `kcw(key, value, length, multiplier, useTrueRange=true)` | Full Keltner width over EMA basis. Range uses true range unless disabled; zero basis is unavailable. |
| `sar(key, start, increment, maximum)` | Wilder parabolic stop and reverse, capped at the preceding two lows or highs. First bar unavailable; direction seeds from the first two closes. Start and increment non-negative, maximum at least start. |
| `supertrend(key, factor, atrLength)` | HL2 bands with RMA true range; frozen `{value,direction}`, direction -1 upwards and +1 downwards. Initial direction downwards; factor positive. |
| `accdist(key)` | Running accumulation/distribution money-flow volume; flat high/low contributes zero. |
| `pvt(key)` | Running close-change ratio times volume. First observation and zero prior close are unavailable. |
| `source(name)` | Current `open`, `high`, `low`, `close`, `hl2`, `hlc3`, `ohlc4`, or `hlcc4`. Stateless and requires a bar event. |

In addition to int, float, bool and string, declarations accept these types. Declarations keep the same fields and
serialized scalar values. Invalid saved values are refused with the existing reset instruction. Options are permitted
only on string and source declarations; numeric bounds and positive step only on numeric declarations.

| Input type | Values and Settings control |
| --- | --- |
| `color` | Hex `#RRGGBB` or `#RRGGBBAA`; color swatch plus text field, preserving alpha when the swatch changes. |
| `source` | One of the eight price sources above. Settings lists all eight unless a non-empty distinct options subset is declared. |
| `timeframe` | Empty string for chart interval or 1 to 16 ASCII letters/digits, such as `60` or `1D`. OpenCandle interval format; no external series is fetched automatically. |
| `symbol` | 1 to 40 letters/digits or `. _ - : ^ = / !`. A symbol value does not open a keyed data connection. |
| `session` | `24x7` or up to eight `HHMM-HHMM` ranges separated by commas, optional colon plus distinct day digits 1 to 7. End 2400 is accepted; overnight ranges are accepted. |
| `time` | Integer Unix seconds from zero through 253402300799 (end of year 9999), with optional integer bounds/step. Settings explicitly shows UTC, including seconds. |
| `price` | Finite number with optional bounds and positive step; numeric Settings field. |

## Calendar, sessions, bar state and added TA

| Member | Behaviour |
| --- | --- |
| `ctx.calendar(time?, zone='UTC')` | Frozen `{year, month, dayofmonth, dayofweek, dayofyear, hour, minute, second, offset}` for Unix seconds (default: the bar time). `dayofweek` 1 is Sunday; `offset` is minutes from UTC. Zones: `UTC`/`GMT`, fixed offsets (`UTC+5`, `GMT-03:30`, `+0530`, at most 14 hours), and America/New_York, Chicago, Denver, Los_Angeles (US daylight rules 2007+, 1987-2006, earlier the 1967 rule), Europe/London, Berlin, Paris, Zurich (EU rule every year), Australia/Sydney (2008+ rule, earlier the last-Sunday rule), Asia/Tokyo, Hong_Kong, Shanghai, Singapore, Kolkata. Pure arithmetic; `Date` stays unavailable. |
| `ctx.insession(session, zone='UTC', time?)` | True when the time lies in the session: `24x7`, or up to eight `HHMM-HHMM` ranges joined by commas, optional `:` plus day digits (1 Sunday to 7 Saturday; all days when omitted). Start inclusive, end exclusive. An overnight range belongs to the day it starts; equal start and end is the whole day. |
| `ctx.barstate` | Frozen `{isfirst, islast}`: the first processed bar of the instance, and the last bar of this calculation. |
| `ctx.nz(value, replacement=0)` | The replacement for `null`, `undefined` or `NaN`, else the value. |
| `ctx.plotarrow(title, valueOrNull, options?)` | Up arrow below the bar for a positive value, down arrow above it for a negative one; zero and null draw nothing. Options `colorup`, `colordown`, `size`. Shares the shape limits. |
| `ta.fixnan(key, value)` | The latest finite value; null before the first. |
| `ta.mode(key, value, length)` | Most frequent window value; ties (including all distinct) take the smallest. |
| `ta.wad(key)` | Running sum: up close adds close minus min(low, prior close); down close adds close minus max(high, prior close); zero on the first bar. |
| `ta.wvad()`, `ta.iii()` | Current bar `(close-open)/(high-low)*volume` and `(2*close-high-low)/((high-low)*volume)`. Flat bar or missing volume (and zero volume for iii) is unavailable. |
| `ta.nvi(key)`, `ta.pvi(key)` | Start at 1; when volume falls (nvi) or rises (pvi) versus the prior bar, grow by the close change ratio. Zero closes and missing volume hold. |
| `ta.pivot_point_levels(key, type, anchor, developing=false)` | Frozen `[P, R1, S1, R2, S2, R3, S3, R4, S4, R5, S5]`, null where the type has no level. A period starts on an anchor bar; on the next anchor the finished period gives the levels until the following anchor. `developing` reads the current period so far. Types and formulas match the built-in Pivot Points: Traditional, Fibonacci, Woodie (uses the new period's open), Classic, DM, Camarilla. |

Higher-timeframe calculations: advance a keyed TA series only when `ctx.timeframe(name)` returns a new completed bar, and keep the result in `ctx.state`, for example `if (d && d.time !== ctx.state.day) { ctx.state.day = d.time; ctx.state.avg = ctx.ta.sma('day-sma', d.close, 20); }`. A key may skip bars; it advances only when called.

## Plot styles, per-bar colours, fills and paths

`ctx.plot(title, valueOrNull, colorOrOptions?)` takes a colour (`#RRGGBB` or `#RRGGBBAA`), `null` (no colour on this bar), or options `{color, style, linewidth, offset, display}`. The colour may change on every bar, as in `{color: ctx.bar.close >= ctx.bar.open ? '#26a69a' : '#ef5350'}`; a plot may use at most 64 distinct colours. `style` is `line`, `stepline`, `histogram`, `columns`, `circles`, `cross`, `area`, `areabr` or `linebr` (OpenCandle lines and areas always break at a null value, so `linebr` and `areabr` draw like `line` and `area`). `linewidth` is an integer from 1 to 10. `offset` shifts the plot by -500 to 500 whole bars. `display` is `all`, `none`, `pane`, `data_window`, `status_line`, `price_scale` or a list of them. Style, linewidth, offset and display must stay the same for a title on every bar. These are the plot's defaults: a saved Style tab entry wins, and a saved colour other than the script's first colour replaces the per-bar colours with that one colour.

`ctx.fill(title, from, to, {color, between})` may also change its colour per bar. `null` leaves a bar unfilled, and the first colour is the fill's editable default. With `between: 'hlines'`, `from` and `to` are `ctx.hline` titles. A run keeps at most 20,000 per-bar fill colour rows. Plot style rows are reported in `visuals.plotStyles`, with one palette index per plot value (-1 means no colour). They are rebuilt by every run, so prefix and continuation results agree bar by bar.

`ctx.linefill.new({line1, line2, color})` fills between two live lines. It returns an id for `set(id, {color})`, `get`, `delete` and `all`. Deleting or evicting either line deletes the fill, and a new fill for the same pair replaces the older one. `ctx.polyline.new({points, xloc, curved, closed, lineColor, fillColor, lineWidth, lineStyle})` draws an immutable path through 2 to 1,000 `{x, y}` points (index or time x, as for lines). It supports `get`, `delete` and `all`. By default 50 linefills and 50 polylines are kept, and `objectLimits` accepts `linefills` from 1 to 500 and `polylines` from 1 to 100. Retained polylines hold at most 5,000 points in all, and the oldest are evicted first.
