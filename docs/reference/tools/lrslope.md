---
id: lrslope
name: Linear regression slope
kind: indicator
family: momentum / regression
sources:
  - title: TA-Lib LINEARREG_SLOPE, ta_LINEARREG_SLOPE.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_LINEARREG_SLOPE.c
    type: secondary
confidence: medium
---

## Purpose
The slope of the least-squares line through the last n prices, in price units per bar.

## How the author meant it to be used
No single author. TA-Lib defines it as the "m" of the fitted line (the same fit as its LINEARREG, which returns b + m x (period - 1)). Common use: positive slope means uptrend, negative downtrend; zero crossings and slope extremes show trend changes and momentum.

## How you interact with it
Automatic, in its own pane. Inputs: length and source. Known at bar close; each bar is an independent fit.

## Calculation
Least squares over x = 0..n - 1 against price: m = (n x sum(xy) - sum(x) x sum(y)) / (n x sum(x^2) - sum(x)^2). Reported in price units per bar (not percent or degrees; TA-Lib's LINEARREG_ANGLE is the separate degree form).

## Standard defaults
TA-Lib default 14; OpenCandle uses 14.

## Reading it
Sign gives direction; magnitude depends on price level, so compare across instruments only after normalising.

## Common mistakes and edge cases
- Mixing price-unit slope with angle or percent slope.
- x direction: x increases with time; reversing it flips the sign.
- Not scale-free.

## Open questions
Some implementations scale the slope (for example as a percent of price).
