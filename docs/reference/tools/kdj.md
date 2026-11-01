---
id: kdj
name: KDJ
kind: indicator
family: oscillator
sources:
  - title: Stochastic Oscillator (Fast, Slow, and Full)
    author: StockCharts ChartSchool, describing George Lane's method
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/stochastic-oscillator-fast-slow-and-full
    type: secondary
confidence: low
---

## Purpose
A stochastic-style oscillator common in Chinese-market charting: K and D lines plus a more sensitive J line.

## How the author meant it to be used
There is no single known author; KDJ is a "random index" variant of George Lane's Stochastic Oscillator (K and D come from RSV, the raw stochastic value). The J line is an extra that exaggerates K's distance from D. Common practice: K crossing above D at low levels is a buy, below at high levels a sell; 80 and 20 mark overbought and oversold; J beyond 100 or below 0 flags extremes. The definition used here is OpenCandle's, not from a primary source.

## How you interact with it
Automatic, in its own pane. Inputs: period, K smoothing, D smoothing. No placement. Known at bar close; recursive.

## Calculation
RSV = 100 x (close - lowest low over n) / (highest high over n - lowest low over n). K = (1 - 1/ks) x K[1] + (1/ks) x RSV; with smoothing 3 that is 2/3 K[1] + 1/3 RSV. D = (1 - 1/ds) x D[1] + (1/ds) x K. J = 3K - 2D. K and D start at 50. Contrast: Lane's %K uses the same RSV formula, and %D an SMA of %K; KDJ uses recursive smoothing instead.

## Standard defaults
9, 3, 3; levels 80 and 20.

## Reading it
Crosses of K and D, zone, and J extremes. J is unbounded and can leave 0 to 100.

## Common mistakes and edge cases
- Using SMA smoothing (the stochastic way) instead of the 2/3 + 1/3 recursion.
- Clipping J to 0..100.
- Zero high-low range: RSV undefined; OpenCandle carries the prior RSV.
- Starting values differ between implementations (50 is common).

## How OpenCandle does it
- K and D start at 50 on the first full window. J = 3K - 2D and is not clipped to 0 to 100.
- A zero high-low range carries the previous RSV, or 50 if there is none yet.

## Open questions
 Variants exist with different smoothing weights.
