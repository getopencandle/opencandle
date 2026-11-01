---
id: cdlharamibear
name: Harami (bearish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLHARAMI.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLHARAMI.c
    type: secondary
  - title: ChartSchool, Candlestick Pattern Dictionary
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary
    type: secondary
  - title: Encyclopedia of Candlestick Charts
    author: Thomas N. Bulkowski
    year: 2008
    url: book
    type: secondary
confidence: medium
---

## Purpose
Two-bar bearish reversal warning after an advance: a long white body followed by a small body contained inside it.

## How the author meant it to be used
As the bullish harami, mirrored (Nison, ChartSchool): a long white body, then a small body within it, in an uptrend. A warning that the advance has stalled, not a full reversal. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the second bar at its close.

## Calculation
Bar 1 white and long; bar 2 a small non-doji body inside bar 1's body; trend up. TA-Lib signals -100 when the first bar is white. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
As the bullish harami.

## Reading it
A warning; look for a close under bar 1's open.

## Common mistakes and edge cases
- As the bullish harami.

## How OpenCandle does it
- Bar 1 is a long white body. Bar 2 has a non-doji body no larger than the average body of the previous 14 bars, lying inside bar 1's body. Touching edges count as inside, and bar 2 can be either colour.
- Needs a prior uptrend.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
As the bullish harami.
