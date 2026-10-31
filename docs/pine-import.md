# Pine Script import

OpenCandle can translate many Pine Script v5 and v6 indicators and simple strategies into [CandleScript](candlescript.md). The result is an ordinary CandleScript document that you review, save and run.

**What the importer is not.** It does not run Pine Script, and OpenCandle has no Pine runtime. It is a one-way translator for a subset of the language. Scripts that use features outside that subset are translated partly, with the rest marked as TODOs for you to finish by hand. Results can differ from other platforms in edge cases, so check the output on a chart before you rely on it.

## How to use it

1. Open **Script editor** and expand **Import Pine script**.
2. Paste the Pine source (up to 64 KiB). Nothing runs at this step.
3. Read the report: how many statements were translated, which features were used, what was not translated (with line numbers), and any notes about behaviour differences.
4. Open the result as a new CandleScript document, review it, then **Run and add to chart**.

Every untranslated construct becomes a `// TODO(pine): ...` comment in the output that names the Pine line and the reason.

## What translates

- **Declarations:** `indicator()` and `strategy()` with title, overlay and the common display arguments. Strategy capital and currency settings come from the Strategy tester instead.
- **Language:** variables, `var` (and `varip`, which behaves like `var` because CandleScript calculates completed bars), reassignment, `if`, `switch`, ternaries, `for` and `while` loops, user functions declared at the top level, tuples, and history references such as `close[1]` and `x[n]`.
- **Built-in values:** `open`, `high`, `low`, `close`, `volume`, `hl2`, `hlc3`, `ohlc4`, `hlcc4`, `bar_index`, `time`, calendar fields, `barstate.isfirst` and `barstate.islast`, named colours and `math.*` constants.
- **Inputs:** `input()` and `input.int`, `float`, `bool`, `string`, `text_area`, `color`, `source`, `timeframe`, `symbol`, `session` and `price`, with defaults, bounds, step and options where CandleScript supports them.
- **Technical analysis:** `ta.sma`, `ema`, `rma`, `wma`, `vwma`, `hma`, `swma`, `alma`, `linreg`, `rsi`, `cci`, `mom`, `roc`, `cmo`, `change`, `stdev`, `variance`, `dev`, `median`, `mode`, `range`, `percentrank`, `cog`, both percentile functions, `tsi`, `mfi`, `wpr`, `highest`, `lowest`, `highestbars`, `lowestbars`, `crossover`, `crossunder`, `cross`, `rising`, `falling`, `cum`, `max`, `min`, `barssince`, `valuewhen`, `correlation`, `atr`, `tr`, `stoch`, `bb`, `bbw`, `kc`, `kcw`, `macd`, `dmi`, `supertrend`, `sar`, `pivothigh`, `pivotlow`, and the variables `ta.obv`, `accdist`, `pvt`, `wad`, `nvi`, `pvi`, `iii`, `wvad`.
- **Maths:** common one-argument `math.*` functions (`abs`, `ceil`, `floor`, `sign`, `sqrt`, `exp`, `log`, `log10`, trigonometry, `todegrees`, `toradians`) and constants.
- **Output:** `plot`, `plotshape`, `plotchar`, `hline`, `fill`, `bgcolor` and `alertcondition`.
- **Strategies:** `strategy.entry`, `strategy.order`, `strategy.exit` (profit, loss, limit, stop and trailing fields), `strategy.close`, `strategy.close_all` and `strategy.cancel`. Orders are virtual and run in the Strategy tester.

## What does not translate (yet)

| Not translated | Why, or what to do instead |
| --- | --- |
| Pine v4 and earlier | Update the script to v5 or later first. |
| `request.security` and other `request.*` calls | Declare other timeframes and symbols with CandleScript's `timeframes` and `symbols` instead. |
| Arrays, matrices and maps | Not supported in this version. |
| Labels, lines, boxes, tables, linefills and polylines | CandleScript has its own drawing objects (`ctx.label`, `ctx.line`, `ctx.box`, `ctx.table`, ...) with a different API; port these by hand. |
| User-defined types, methods, enums, libraries, `import` and `export` | Not supported in this version. |
| `syminfo.*`, `timeframe.*`, `ticker.*`, `chart.*`, `session.*`, `runtime.*` | Not available to CandleScript or not translated yet. |
| Some `ta.*`, `math.*`, `str.*`, `color.*` and `strategy.*` functions | Reported individually with the line number. |
| Functions declared inside blocks | Move them to the top level. |

## Behaviour differences to know about

- CandleScript calculates on completed bars only. `barstate.isconfirmed`, `ishistory` and `isnew` are always true, and `barstate.isrealtime` is always false.
- OpenCandle keeps one net position per strategy, so `strategy.close` closes the whole position, not only the named entry, and its `qty` arguments are ignored.
- `time` is the bar open time in Unix milliseconds.
- A `ta.*` call inside a loop keeps one series per call site; move such calls out of the loop.
- Pine colour names map to OpenCandle's own palette, and a few plot shapes and styles are drawn with the closest OpenCandle equivalent. The report lists each case.
- Arguments that have no CandleScript equivalent (for example input tooltips and groups, order comments, `bgcolor` offset) are dropped with a note.

## Licensing note

The importer is original OpenCandle code written from public language documentation. It contains no code from TradingView or from other Pine implementations. Pine Script is a trademark of TradingView, Inc.; OpenCandle is not affiliated with TradingView. Make sure you have the right to use and modify any script you import.
