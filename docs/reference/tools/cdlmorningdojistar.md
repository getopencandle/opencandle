---
id: cdlmorningdojistar
name: Morning Doji star (bullish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLMORNINGDOJISTAR.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLMORNINGDOJISTAR.c
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
A morning star whose middle bar is a doji.

## How the author meant it to be used
Nison: the same three-bar bottom with a doji instead of a small body in the middle; he considers it more bullish because the doji carries a stronger indecision signal. The doji gaps below bar 1's body; bar 3 is a white that closes well into bar 1. ChartSchool: first a long black in a downtrend, then a gapped-down doji with a small range, then a close above the midpoint of the first. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the third bar at its close.

## Calculation
Bar 1 black and long; bar 2 a doji body wholly below bar 1's body; bar 3 white closing above the midpoint of bar 1's body (OpenCandle) or by TA-Lib's 0.3 penetration. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
As the morning star.

## Reading it
Slightly stronger than the plain morning star.

## Common mistakes and edge cases
- Requiring shadow gaps (abandoned baby).
- The doji threshold varies.

## How OpenCandle does it
- The middle bar is a doji (body at most 5% of its own range) whose body gaps below bar 1's body. Its shadows may overlap bar 1's; when they clear completely it is an abandoned baby instead.
- Bar 1 must have a long body and bar 3 must close above the midpoint of bar 1's body (TA-Lib uses a shallower 30% penetration).
- A "long" body is larger than the average body of the previous 14 bars; a "small" body is at most half of that average; a doji body is at most 5% of its own range.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
As the morning star.
