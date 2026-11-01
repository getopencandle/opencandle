---
id: roc
name: Rate of change
kind: indicator
family: momentum
sources:
  - title: ChartSchool, Rate of Change (ROC)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/rate-of-change-roc
    type: secondary
  - title: TA-Lib ROC source, ta_ROC.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_ROC.c
    type: secondary
confidence: high
---

## Purpose
The percentage change in price over the last N bars: a pure momentum oscillator around zero.

## How the author meant it to be used
No single author; the idea is generic momentum. ChartSchool: ROC (also called Momentum in its raw form) compares the current price with the price N periods ago; positive means prices are higher than N bars ago. There is no upper bound but the downside is capped at -100 percent. Signals: centerline crossovers (prone to whipsaw but useful for trend), overbought and oversold extremes (ChartSchool uses plus and minus 10 percent for a 12 to 20 day ROC, set from the security's own history), and divergences (often misleading after a sharp initial surge). Several lengths (21, 63, 126, 252 days) can gauge the trend.

## How you interact with it
Automatic. You set the length and the source. Nothing placed. Known at the close; the live bar moves while it forms.

## Calculation
ROC = (price - price N bars ago) / price N bars ago x 100. TA-Lib: (price / price N bars ago - 1) x 100, and returns 0 when the old price is zero. Note this is not the same as TA-Lib's ROCP (fraction) or ROCR (ratio), nor as the raw Momentum price difference.

## Standard defaults
ChartSchool example 12; OpenCandle uses 9. No author default exists.

## Reading it
Above zero rising = accelerating advance; below zero falling = accelerating decline. Extremes are relative to the security's past, not universal. Smoothing ROC with a short average reduces noise.

## Common mistakes and edge cases
- Returning a fraction instead of percent.
- The N-th prior price, not the (N-1)-th: with length 12, the first value needs 13 bars (the base close is 12 bars back).
- Zero base price.
- Comparing ROC of different lengths on one scale.

## How OpenCandle does it
- If the base price is zero, no value is shown (TA-Lib returns 0).
- Default length is 9. The first value needs N + 1 prices, because the base is the close N bars back.

## Open questions
None.
