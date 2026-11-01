---
id: vwap
name: Volume Weighted Average Price
kind: indicator
family: volume
sources:
  - title: ChartSchool, Volume-Weighted Average Price (VWAP)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/volume-weighted-average-price-vwap
    type: secondary
  - title: The Total Cost of Transactions on the NYSE, Journal of Finance 43(1)
    author: Stephen Berkowitz, Dennis Logue, Eugene Noser
    year: 1988
    url: book
    type: primary
  - title: Volume-weighted average price (history and uses)
    author: Wikipedia contributors
    year: n/a
    url: https://en.wikipedia.org/wiki/Volume-weighted_average_price
    type: secondary
confidence: medium
---

## Purpose
The volume-weighted average of price since the start of a period, usually the trading day. It is an execution benchmark and a line that price tends to gravitate to during the session.

## How the author meant it to be used
VWAP began as an institutional execution benchmark, not a charting study. Wikipedia attributes the first VWAP benchmark execution to James Elkins at Abel Noser in 1984, and Berkowitz, Logue and Noser (1988) used it in measuring transaction costs. ChartSchool describes the retail use: price above VWAP suggests the intraday trend is up and below suggests down; a buy filled below VWAP is a good fill and a sell above it a good fill. It behaves like a one-day moving average whose weight grows as the day goes on.

## How you interact with it
Automatic. Inputs include Source (default typical price, hlc3), the anchor period (Session by default, with Week, Month, Quarter, Year, Decade, Century and event anchors where data exists), a time zone setting, and up to three optional standard-deviation or percentage bands. Nothing is placed by clicking; for a self-placed start use Anchored VWAP (click a bar to place it, and change the anchor from its legend or right-click menu). The line resets at the start of each anchor period (for session, on the first bar of each new day in the chosen zone). Each bar's value includes that bar's own volume, so the live bar's value moves with every trade and the bar's final value is known only at its close. Early values in a period rest on few bars and are erratic. No look-ahead is involved.

## Calculation
Cumulative(price x volume) / cumulative(volume), accumulated from the first bar of the period. With the default source, price is (high + low + close) / 3. ChartSchool: "Cumulative(Volume x Typical Price)/Cumulative(Volume)". The first value of a period equals that bar's typical price. Bands, when on, are VWAP plus and minus a multiplier times the volume-weighted standard deviation around VWAP (OpenCandle uses a population form), or a percentage of VWAP. Bars with missing price or volume are skipped for that bar and the sums continue.

## Standard defaults
Source hlc3, Session anchor (ChartSchool: single market day, from open to close). Band 1 at multiplier 1 is OpenCandle's default.

## Reading it
Price above a rising VWAP is bullish for the day; below a falling VWAP is bearish; a flat VWAP in a range-bound day sits inside the day's range. ChartSchool says VWAP is not defined for daily, weekly or monthly periods in its own charts, because it needs intraday data and a reset each session. OpenCandle offers longer anchors; on daily bars they accumulate across the chosen period.

## Common mistakes and edge cases
- Not resetting at the new session or letting extended hours merge into the regular session unintentionally.
- Using close instead of typical price as the source.
- Minute bars approximate tick VWAP; larger bars blur it.
- Overnight sessions in futures and crypto have no natural day boundary; the zone setting decides.
- Dividends and splits anchors need event data.

## How OpenCandle does it
- Default source is typical price (hlc3). The live bar includes its partial volume, so the latest value moves until the bar closes.
- The Session anchor is the calendar date in the exchange time zone, so US pre-market and after-hours bars sit inside that day's VWAP.
- On daily bars Session gives each bar's own typical price. Week and longer anchors accumulate across bars.
- Bars with a missing price or volume are skipped and the sums continue.
- Bands use the population volume-weighted standard deviation around VWAP.

## Open questions
Whether pre-market and after-hours volume should be inside the session VWAP varies by tool and is not settled by ChartSchool. Behaviour on daily charts is OpenCandle's extension.
