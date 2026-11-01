---
id: adx
name: Average directional index
kind: indicator
family: trend
sources:
  - title: New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: primary
  - title: ChartSchool, Average Directional Index
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-directional-index-adx
    type: secondary
  - title: TA-Lib ADX source, ta_ADX.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_ADX.c
    type: secondary
confidence: high
---

## Purpose
Measures how strong a trend is, regardless of direction, on a 0 to 100 scale. It is the final smoothed stage of Wilder's Directional Movement System.

## How the author meant it to be used
Wilder (1978) built +DI and -DI to show direction and ADX to show strength. ChartSchool: when +DI is above -DI the trend is up, below it down; ADX rising shows a strengthening trend of either sign; ADX is not a direction signal. The usual rule of thumb (a practitioner reading, not Wilder's exact words) is that low ADX means a trendless market, and readings above about 25 a trending one; Wilder himself used ADX to decide whether to apply trend-following or range systems.

## How you interact with it
Automatic. Length input (and smoothing choice in OpenCandle). Draws the ADX line; +DI and -DI come from the same calculation. The value is known at the bar's close; it needs a long warm-up.

## Calculation
Per bar: TR = max(H - L, |H - Cy|, |L - Cy|). +DM = H - Hy if that exceeds Ly - L and is positive, else 0; -DM = Ly - L if that exceeds H - Hy and is positive, else 0. Smooth TR, +DM, -DM with Wilder smoothing (first value = sum of the first N, then prior - prior/N + current). +DI = 100 x smoothed +DM / smoothed TR, -DI likewise. DX = 100 x |+DI - -DI| / (+DI + -DI). First ADX = average of the first N DX values; after that ADX = (prior ADX x (N - 1) + DX) / N. TA-Lib's lookback is 2N - 1 bars before the first ADX, plus an optional unstable period. ChartSchool says about 150 periods are needed for values to settle. If +DI + -DI is zero, TA-Lib skips the DX.

## Standard defaults
14, as recommended by Wilder.

## Reading it
Rising ADX with +DI above -DI: strengthening uptrend. ADX is high-and-falling: trend losing strength. Crossing of DI lines are the direction signals.

## Common mistakes and edge cases
- Using an exponential average instead of Wilder smoothing.
- Initialising the first ADX differently, which changes early values and takes bars to converge.
- Both +DM and -DM from the same bar: only the larger counts, the other is zero.
- Zero DI sum, flat bars.
- The earliest 2N bars are not reliable.

## How OpenCandle does it
- Wilder smoothing (RMA) seeded with a simple average of the first window. The DI values equal those from Wilder's sum-seeded version, so only the start-up differs.
- The first ADX appears on bar 2N - 1, as in TA-Lib. ADX smoothing and DI length are separate inputs, both 14 by default.
- If +DI + -DI is zero, that bar's DX is skipped.

## Open questions
Whether OpenCandle also draws +DI and -DI and its smoothing options are not covered here.
