---
id: ratio
name: Ratio
kind: indicator
family: comparative / relative
sources:
  - title: ChartSchool, Price Relative / Relative Strength
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/price-relative-relative-strength
    type: secondary
confidence: high
---

## Purpose
The chart symbol divided by a second symbol, bar by bar, to see which one is stronger.

## How the author meant it to be used
ChartSchool (as the Price Relative): the base security divided by a comparative security; the line rises when the base outperforms and falls when it underperforms. Used to gauge a stock against an index, against its sector, or one index against another. Read the trend of the ratio, its break of support or resistance, moving averages on the ratio (for example a 150-day SMA), and divergences with the base price.

## How you interact with it
Automatic once a second symbol is chosen. You pick the second symbol and the source. Nothing is placed; the second series must be aligned to the chart's bars. Values use only the current bar of each series, so no repaint beyond the live bar. If the second symbol is loading or unavailable, nothing should plot, with the reason shown.

## Calculation
ratio(t) = base(t) / second close(t). ChartSchool ratio symbols divide open, high and low of the first symbol by the second symbol's close, and close by close. OpenCandle plots a single line of source over second close. A zero denominator gives no value. The ratio is not rescaled.

## Standard defaults
No author defaults; OpenCandle uses SPY and close.

## Reading it
Rising ratio = relative strength; the change in the ratio equals the difference in percent changes of the two (ChartSchool, to a first approximation for small moves).

## Common mistakes and edge cases
- Misaligned bars (different sessions, holidays, missing days).
- Dividing by the wrong series (inverts the reading).
- Scale changes if one symbol splits; use adjusted data.
- Comparing the level of the ratio between charts; only the shape matters.

## How OpenCandle does it
- Plots a single line: the chosen source divided by the second symbol's close, not rescaled. Default second symbol is SPY, on the close.
- A zero denominator gives no value. Bars must match in time exactly: a missing bar in the second symbol leaves a gap rather than a filled value.

## Open questions
When the second symbol has no bar, OpenCandle leaves a gap rather than filling it.
