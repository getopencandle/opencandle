---
id: cdlgravestone
name: Gravestone Doji (bearish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLGRAVESTONEDOJI.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLGRAVESTONEDOJI.c
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
A doji with open, close and low together at the bottom of the range and a long upper shadow, read as a bearish warning near a top.

## How the author meant it to be used
Nison describes the gravestone doji as a doji where open and close sit at the session low; it matters most at a market top, where it shows a rally that failed completely. At a bottom it is less significant. ChartSchool: a doji at or very near the low of the day. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. Automatic; the mark sits on the bar at its close. The 'bearish' label is OpenCandle's choice because it is read at an advance's end.

## Calculation
Bar: body at most 5% of the range (OpenCandle), lower shadow at most 10% of range, long upper shadow. TA-Lib: doji body, open and close at the low (no or very short lower shadow), and an upper shadow that is not very short; no trend test. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Doji body at most 5% of range (OpenCandle); trend rule applies in OpenCandle.

## Reading it
A warning after an advance; wait for a lower close next bar.

## Common mistakes and edge cases
- Requiring identical open and close; near-equal is the standard.
- Without a trend filter it also fires at lows, where it means something different.
- Needs a non-zero range.

## How OpenCandle does it
- A doji with body at most 5% of its range and a lower shadow at most 10% of the range, so the upper shadow is long. TA-Lib uses a looser 10% doji and has no trend test.
- The bearish label is OpenCandle's choice: the mark needs a prior uptrend, because the shape matters most at a top.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
The 5% doji limit is OpenCandle's own choice.
