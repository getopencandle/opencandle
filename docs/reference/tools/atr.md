---
id: atr
name: Average True Range
kind: indicator
family: volatility
sources:
  - title: New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: primary
  - title: ChartSchool, Average True Range
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-true-range-atr
    type: secondary
  - title: TA-Lib ATR source, ta_ATR.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_ATR.c
    type: secondary
confidence: high
---

## Purpose
Measures volatility as the smoothed average of the true range, which includes gaps between bars. It says how much a market typically moves, not which way.

## How the author meant it to be used
Wilder designed it for commodities, where gaps and limit moves make the plain high-low range misleading, and published it in 1978 along with RSI, Parabolic SAR and the directional movement system. ChartSchool: it is a volatility measure only, usually used to size stops and positions (stops placed a multiple of ATR away) and as a component of other systems.

## How you interact with it
Automatic. One input, length. Single line in its own pane. Known at the bar's close. The early bars depend on the initialisation rule.

## Calculation
True Range = the greatest of (High - Low), |High - previous Close|, |Low - previous Close|. ATR: first value = the average of the first N true ranges; afterward ATR = (prior ATR x (N - 1) + current TR) / N (Wilder smoothing). ChartSchool uses High - Low as the first bar's TR; TA-Lib starts true range at the second bar (the first bar has no previous close) and its first ATR needs N + 1 bars, so early values differ slightly between sources and converge.

## Standard defaults
14 (Wilder).

## Reading it
Rising ATR: expanding volatility (often at turning points or breakouts); falling: contraction. It is in price units, so it is not comparable across instruments without normalising.

## Common mistakes and edge cases
- Using a simple or exponential average instead of Wilder smoothing.
- Forgetting the gap terms in the true range.
- Different first-bar handling makes the first values differ between tools.
- Zero-range, gap-free bars give TR of zero only on a perfectly flat bar.

## How OpenCandle does it
- The first true range is high - low. The first ATR is the simple average of the first N true ranges (the ChartSchool convention, not TA-Lib's), and Wilder smoothing continues from there.
- Wilder smoothing (RMA) is the default; simple, exponential and weighted averages are optional.

## Open questions
Which first-bar convention OpenCandle uses (ChartSchool's or TA-Lib's) is not confirmed.
