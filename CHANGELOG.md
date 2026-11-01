# Changelog

All notable changes to OpenCandle are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## 0.8.2 - 2026-11-01

### Added
- New **Export all indicators (.xlsx)** item in the chart menu. It calculates every built-in indicator at its default settings on the chart's bars and saves one workbook with Data, Patterns, Drawings and Key sheets.
- 12 new built-in indicators, each written from its original published definition:
  - Bollinger Bands breach, DI cross signals (signal on the cross bar, Wilder's extreme point drawn as a stop level, ADXR filter), MACD divergence and RSI failure swings (with a minimum swing size).
  - Anchored VWAP with three standard deviation bands, placed by clicking the bar to anchor it (Change anchor in its menus), Session VWAPs (Tokyo, London, New York), Opening range breakout and Relative volume.
  - Support and resistance zones, Adaptive trend channel, Auto fib multi-scale (short, medium and long lookbacks) and Auto fib range volume profile.
- RSI can show forming divergences (off by default). They are drawn dashed and can change until confirmed.
- Auto fib retracement has a Lookback window mode.
- Watchlist columns for ADR (14), % of ADR used, position in the day's range, and price versus the prior day's range and today's open, with a one-click Day range columns preset.
- Long and short position tools can set the stop from ATR (k x ATR, default 2 x ATR 14) and size the quantity from your risk.
- An **About** tab in every indicator's and drawing tool's settings (and an info button in the Indicators list, Ctrl+I) explains what the tool is for, how its author meant it to be used, how it is calculated, its defaults, and where OpenCandle makes its own choices, with sources.
- The Indicators list shows common acronyms after full names, for example "Relative Strength Index (RSI)", and typing an acronym finds the indicator.
- In the Indicators list, clicking an indicator's "N on chart" count removes the one added most recently (Ctrl+Z brings it back).
- Links to the candlestick guide on getopencandle.com from the Patterns tab and from each candlestick pattern's About tab.
- Historical volatility and the Volatility indicators have an Annualization setting. Auto, the default for new instances, follows the chart interval and market.
- Every chart pattern offers Require breakout confirmation (on for new instances). With it on, flags, pennants, wedges, cup and handle, triangles and rectangles signal only on the breakout close, and patterns that fail first are not reported.

### Fixed
- XABCD, Cypher, ABCD and Three Drives patterns draw above the candles.
- Example table position settings read "Bottom right" instead of "bottom_right".
- Sequential 9-13 counts stay clear of the legend and are not cut off at the chart edges.
- Auto trendlines from old pivots no longer stretch the price scale.
- The position tools' quantity box is readable on light chart backgrounds.
- OpenCandle.exe's file properties show the OpenCandle copyright.
- Fixed range volume profile counts each bar's volume once, spread across the bar's range (it could count a bar up to four times). It keeps its start bar on coarser intervals and its whole last bar on finer ones.
- Anchored VWAP (drawing) keeps its start bar on coarser intervals and draws nothing until there is volume.
- Schiff, Modified Schiff and Inside pitchforks start in the right place on log charts.
- Cypher is marked valid only when its points go the right way.
- Dashed and dotted lines work on curves, arcs and brush strokes.
- Stickers keep their size when you zoom or change interval.
- Regression trend alerts restart when you change a deviation. Drawings anchored inside the newest bar snap to it.
- Chart pattern tooltips say when the pattern became known, and a dot marks the bar where the signal fired.
- Abandoned baby, Harami and Rising/Falling three methods follow their textbook body conditions.
- Pivot points (Auto) use yearly pivots on weekly and monthly charts.
- McGinley dynamic no longer overshoots price or turns negative after a large drop.
- Rob Booker Knoxville divergence signals once per divergence.
- Bollinger bars follow John Bollinger's 2024 definition.
- Auto fib extension and Auto pitchfork wait for a confirmed third pivot.
- Average daily range on intraday charts ignores a partial first day.
- Awesome and Accelerator oscillators colour an equal bar like the previous one, and the AO legend reads "AO".
- Bars needed is correct for SMI and Technical ratings.
- Labels and notes: "Bull + bear power", Donchian channels includes the current bar (use Price channel for breakouts), Mass index shows its 27 and 26.5 levels.
- Table view stays fast with thousands of rows on a live chart.
- You can add many more indicators to one chart before hitting the calculation limit (20 mixed indicators on 20,000 bars works).
- Opening range breakout's legend shows the session it actually uses (00:00 UTC on 24/7 markets).
- Pattern and signal markers in indicator panes stay clear of the pane's legend.
- DI cross signals keeps its pane scaled to the DI lines.

### Security
- Electron updated to 44.9.1, which includes a security fix and stops trusting compromised eMudhra intermediate certificates.

### Changed
- Data from Alpaca, Coinbase and FRED can now be exported for your own analysis: chart data CSV, all-indicators workbook, seasonals, and the Macro maps and Yield curves tables. Each file, or the message shown after saving it, reminds you that the provider's terms apply and the file must not be shared or resold.

## 0.8.1 - 2026-10-31

A correctness release: indicator values, timing and drawing tools were checked against their published definitions, and what we found is fixed below.

### First run
- A new install opens on a live BTC-USD chart from Coinbase public data, with no account or key. If Coinbase cannot be reached, it switches to example data with a **Try live again** button.
- Alpaca setup is no longer shown at first launch. Opening a stock symbol shows a short hint about adding a free Alpaca key.
- New **Help > Report where you got stuck** item, and a matching issue form on GitHub.
- Saved workspaces are not changed.

### Indicators
- Fisher Transform now follows Ehlers' published formula.
- EMA Cross no longer marks a false cross on the second bar.
- All EMA-based indicators start the same way (seeded with a simple average), so MACD inside Technical Ratings matches the MACD indicator.
- A bar with missing volume now leaves a gap at that bar only, instead of blanking Volume, VWAP, OBV, MFI, CMF and other volume indicators.
- Session VWAP resets at the exchange session for stocks and at 00:00 UTC for crypto, on the chart and in alerts. Saved VWAPs keep their setting.
- Supertrend keeps its trend across a missing bar.
- CCI, Median and TWAP use their correct default source everywhere, including alerts and scripts.
- Periodic and Session Volume Profile show the levels as of each bar instead of the finished period's levels.
- Intraday pivots use regular-session bars, like Pivot Points Standard.
- ADR on intraday charts uses completed daily ranges.
- Chart pattern signals no longer change on older bars as new bars arrive.
- Double and triple tops and bottoms and head and shoulders can require a close through the neckline (on for new instances).
- Piercing, Dark Cloud Cover, Tweezers, Kicking and Harami follow Nison's definitions.
- Detrended Price Oscillator (non-centered) subtracts the current average from the earlier price, as defined.
- 24-hour Volume shows no total when a bar inside the window has unknown volume.
- A later pre-market or after-hours bar no longer changes an earlier day's higher-timeframe confirmation.
- Auto Elliott Waves no longer moves a wave end after it has been drawn.
- Volume Delta, Up/Down Volume and CVD no longer see future intrabar data during bar replay.
- "Wait for timeframe close" now waits for the bar to close, on charts and in scripts.

### Indicator display
- Legend, data window and table view show the same value with the indicator's offset and precision.
- Large values are shortened (for example 7.6M) on the scale, legend, data window and crosshair.
- Volume bars are coloured by candle direction and drawn behind price for new instances.
- Volume Delta and CVD draw inside their pane. Trading Sessions draws Tokyo, London and New York by default.
- Periodic Volume Profile has an Auto period that follows the chart interval.
- VWAP and TWAP break the line at each reset.
- Pivot Points Standard labels its levels and shows P, R1, R2, S1 and S2 by default.
- Line overlays draw above the candles.
- Pattern, Sequential and Auto Elliott labels no longer pile on top of each other or stretch the price scale. Williams Fractals markers are easier to see.
- Correlation, Relative Strength, Spread and Ratio work with example data. Seasonality explains why it cannot run on example data.

### Drawing tools
- Harmonic patterns (XABCD, Cypher, ABCD, Three Drives) show each ratio on the dashed line between the points it compares. XABCD now shows the XD ratio, and Cypher shows its own ratios.
- Prices on drawings use the instrument's tick size instead of two decimals.
- Rays, pitchforks, fans and Fibonacci extensions extend in the direction they are drawn.
- Fibonacci time zones, Gann time lines and pitchfork midpoints count bars instead of calendar time.
- Elliott wave tools have a starting point, so wave 1 is drawn. Saved Elliott drawings are converted when loaded.
- The triangle pattern draws its two boundary lines. Parallel channels stay parallel on a log scale.
- Changing a Fibonacci retracement's settings no longer flips it.
- After switching interval, drawings sit on the bar that contains their time.
- Gann box time divisions are labelled, and Gann fan uses the classic angle notation.
- Readable label backgrounds on measurement, Elliott and head and shoulders labels. Callout and note text wraps.
- Regression trend has upper and lower deviation settings and shows Pearson's R.
- Long and short positions show "Not filled" until the entry is reached.
- Better default line colours on light chart backgrounds. Adding an image no longer fails on a fresh chart.

### Other fixes
- Alpaca **Test connection** shows its result right under the buttons.
- Live intraday charts show the daily change without a daily feed.
- Grid layouts always show the change percent in each chart's legend.
- The Daily ATR and Bar colors example tables open at the bottom right, away from the legend.

## 0.8.0 - 2026-10-31

First public release.

### Charts
- 22 chart types, including candles, hollow and volume candles, Heikin Ashi, Renko, Kagi, point and figure, line break, range bars, volume footprint, TPO and session volume profile.
- 29 multi-chart layouts with up to 16 charts, layout tabs, a layout library, and sync for symbol, interval, crosshair, time, date range and drawings.
- Symbol search, compare and overlay symbols, standard, custom and range intervals, go to date, data window, table view and chart image export.
- Two built-in themes, OpenCandle Medium Dark (default) and OpenCandle Dark, with full chart appearance settings.

### Indicators and drawings
- 211 built-in indicators, including 5 volume profiles, 17 chart patterns and 45 candlestick patterns.
- 89 drawing tools with an object tree, templates, favorites, lock and hide, duplicate, magnet snapping and undo/redo.

### Analysis and practice
- Bar replay that never exposes future bars to calculations.
- Alerts on price, drawings and indicators, with a manager, trigger history and export.
- Watchlists with import and export.
- Strategy tester with 23 built-in strategies and saved reports.
- Paper trading with market, limit, stop and stop-limit orders and a DOM pane, using virtual money only.

### Scripting
- CandleScript: a sandboxed scripting language for indicators, strategies and alert conditions, with an editor, library, logs, tables and drawing objects.
- Pine Script importer that translates common Pine v5/v6 indicators and simple strategies into CandleScript for review.

### Data
- Built-in practice data, CSV and JSON import, Coinbase public crypto data, Alpaca US stocks with your own key, FRED economic series on demand, and SEC EDGAR fundamentals and filings.
- Data sources page that shows what each kind of data needs, where settings are saved, and export or import of settings without keys.

### Other
- Screener, fundamentals, market views, heatmap, calendar and news imports, and a portfolio view.
- No account, no login and no telemetry. Keys are encrypted with your Windows sign-in.
