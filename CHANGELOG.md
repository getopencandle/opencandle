# Changelog

All notable changes to OpenCandle are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

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
- Piercing, Dark Cloud Cover, Tweezers and Kicking follow Nison's definitions.
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
