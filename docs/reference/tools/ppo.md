---
id: ppo
name: Price oscillator
kind: indicator
family: momentum
sources:
  - title: ChartSchool, Percentage Price Oscillator
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/percentage-price-oscillator-ppo
    type: secondary
  - title: TA-Lib PPO source, ta_PPO.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_PPO.c
    type: secondary
  - title: MACD
    author: Gerald Appel
    year: 1979
    url: book
    type: primary
confidence: medium
---

## Purpose
The percentage version of MACD: the difference between a fast and a slow moving average expressed as a percent of the slow one, so readings are comparable across price levels and time.

## How the author meant it to be used
The parent MACD is Gerald Appel's; the PPO is its percentage form with no single credited inventor. ChartSchool: signals are the same as MACD (signal-line crossovers, centerline crossovers, divergences), but PPO is independent of the price level, so different securities can be compared and one security compared across years even after a large price change. Not good for overbought and oversold since it is unbounded.

## How you interact with it
Automatic. You set fast, slow and signal lengths and the source. Nothing is placed. A signal crossover is known at the close of the bar where it occurs; it can flip while that bar forms.

## Calculation
PPO = (fast EMA - slow EMA) / slow EMA x 100. Signal = EMA of PPO over the signal length. Histogram = PPO - signal. EMAs are seeded with the SMA of the first N values (ChartSchool and TA-Lib). TA-Lib returns 0 when the slow average is zero and lets the average type be changed (default SMA in TA-Lib, EMA in ChartSchool and the usual practice; be explicit).

## Standard defaults
12, 26, 9 on closes (ChartSchool). Setting the signal to 1 removes the histogram.

## Reading it
Above zero = fast average above slow (upside momentum); below = downside. Signal-line crossovers and histogram turns for timing; divergences for reversal warnings. PPO is larger in percent for volatile names, so a threshold chosen for one name is not universal.

## Common mistakes and edge cases
- Dividing by the fast average or by price instead of the slow average.
- Not multiplying by 100.
- Using SMA where EMA is intended (TA-Lib's default differs).
- Needs slow length plus signal length bars to complete.

## How OpenCandle does it
- The average type is fixed at EMA (TA-Lib defaults to SMA). EMAs start from a simple average of the first N values.
- If the slow EMA is zero, no value is shown (TA-Lib returns 0).

## Open questions
None significant. OpenCandle fixes the average type at EMA.
