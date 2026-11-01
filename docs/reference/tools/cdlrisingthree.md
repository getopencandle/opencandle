---
id: cdlrisingthree
name: Rising three methods (bullish)
kind: pattern
family: candlestick continuation
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLRISEFALL3METHODS.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLRISEFALL3METHODS.c
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
Five-bar bullish continuation: a long white bar, three small bars staying inside its range, and a final long white bar that closes to a new high.

## How the author meant it to be used
Nison: a long white bar, then three small real bodies (usually black) that stay within the first bar's high-low range, then a long white bar closing above the first bar's close. The pause is a consolidation, not a trend change; the small bodies must not break the first bar's range. ChartSchool: the fifth day closes at a new high. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the fifth bar at its close. Five bars are needed, so it lags.

## Calculation
Bar 1 long white; bars 2 to 4 small bodies (at most the average body of the previous 14 bars in OpenCandle) with ranges inside bar 1's range; bar 5 long white closing above bar 1's close. TA-Lib also requires bar 5 to open above bar 4's close and the small bars to be the opposite colour, descending, and inside bar 1's range. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Exactly three small bars.

## Reading it
Bullish continuation; it fails if the small bars break bar 1's low.

## Common mistakes and edge cases
- Allowing two or four small bars (Nison permits variation, TA-Lib does not).
- Comparing bodies to the first bar's body instead of its range.
- Requiring the small bars to be black.

## How OpenCandle does it
- Exactly three inner bars. Each has a body no larger than the average body of the previous 14 bars and a high-low range wholly inside bar 1's range. Their colour does not matter and they need not descend.
- Bar 5 must be a long white bar closing above bar 1's close. TA-Lib also needs it to open above bar 4's close; OpenCandle does not.
- As a continuation pattern it needs a prior uptrend.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
Whether the small bars must descend (TA-Lib) or just stay inside.
