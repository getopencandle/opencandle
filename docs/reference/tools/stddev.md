---
id: stddev
name: Standard deviation
kind: indicator
family: volatility
sources:
  - title: ChartSchool, Standard Deviation (Volatility)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/standard-deviation-volatility
    type: secondary
  - title: TA-Lib STDDEV source, ta_STDDEV.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_STDDEV.c
    type: secondary
confidence: high
---

## Purpose
Measures how widely prices in the look-back window spread around their mean; used as a volatility gauge and as the core of Bollinger Bands. It is a statistical measure with no single technical-analysis author.

## How the author meant it to be used
ChartSchool: low values mean prices are clustered near the average, high values mean wide dispersion. Values are in price units, so a higher-priced security has larger values without being more volatile; divide by price or compare with the security's own moving average of standard deviation to judge what is high.

## How you interact with it
Automatic, in its own pane. Set length and source. Nothing is placed. Each value uses the current and earlier bars only.

## Calculation
Population estimator: mean of the N values, sum of squared deviations from that mean, divide by N, take the square root. ChartSchool states it uses the population form (like a spreadsheet STDEVP), the same as Bollinger Bands. TA-Lib's STDDEV is also the population form, times an optional deviations factor (default 1).

## Standard defaults
ChartSchool's worked example is 10 periods; 20 is the Bollinger default (OpenCandle uses 20). Source is close.

## Reading it
Rising values show expanding volatility, usually around breakouts or selloffs; low values show consolidation. It is not directional.

## Common mistakes and edge cases
- Using the sample (N-1) estimator gives slightly larger values; that is a different tool.
- Comparing raw values across securities of different price.
- A window with a missing value should be unavailable.

## How OpenCandle does it
- Uses the population form (divide by N), as Bollinger Bands do, computed in two passes.
- Default length is 20 on the close.

## Open questions
None significant.
