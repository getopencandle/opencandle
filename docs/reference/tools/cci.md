---
id: cci
name: Commodity channel index
kind: indicator
family: momentum
sources:
  - title: Commodities magazine article introducing CCI
    author: Donald Lambert
    year: 1980
    url: book
    type: primary
  - title: ChartSchool, Commodity Channel Index
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/commodity-channel-index-cci
    type: secondary
  - title: TA-Lib CCI source, ta_CCI.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CCI.c
    type: secondary
confidence: high
---

## Purpose
Measures how far the typical price is from its average, scaled by typical deviation, to spot new trends and overbought or oversold extremes. Lambert designed it for cyclical turns in commodities.

## How the author meant it to be used
ChartSchool: Lambert introduced CCI in Commodities magazine in 1980. Lambert chose the 0.015 constant so about 70 to 80 percent of values fall between -100 and +100 (the share depends on the look-back). Readings above +100 or below -100 are unusual strength or weakness. Used as a coincident indicator, a surge above +100 may start an uptrend and a plunge below -100 a downtrend; used as a leading indicator, extremes foreshadow mean reversion and divergences warn of momentum shifts. ChartSchool notes zero-line crossovers whipsaw and that requiring +100 / -100 reduces false signals at the cost of lag.

## How you interact with it
Automatic. Inputs: length and source. In OpenCandle the source defaults to HLC3 (typical price). Value known at bar close.

## Calculation
Typical price TP = (high + low + close) / 3 (or the chosen source). CCI = (TP - SMA(TP, N)) / (0.015 x MeanDeviation), where MeanDeviation = (sum over the N bars of |TP - SMA(TP, N)|) / N, with the SMA being the current window's mean (not the mean at each earlier bar). TA-Lib follows this (tempReal / (0.015 x tempReal2), with a zero-denominator guard). A flat window (deviation zero) has no defined value.

## Standard defaults
20 (ChartSchool); TA-Lib default is 14. Levels +100 and -100.

## Reading it
Above +100 strong, below -100 weak; moves back inside the band are the exit or fade point. Most readings sit inside the band by design.

## Common mistakes and edge cases
- Using standard deviation instead of mean absolute deviation.
- Using each earlier bar's SMA inside the deviation sum instead of the current one.
- Forgetting the 0.015 constant.
- Using close instead of typical price changes values.

## How OpenCandle does it
- New instances use HLC3 (typical price) as the source; charts saved earlier keep their close source.
- The deviation is the mean absolute deviation around the current window's average. A flat window (zero deviation) gives no value.
- Default length is 20. An optional smoothing line of the CCI is available and is off by default.

## Open questions
Whether the constant applies to a different source is not documented.
