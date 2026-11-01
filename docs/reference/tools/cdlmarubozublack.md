---
id: cdlmarubozublack
name: Marubozu black (bearish)
kind: pattern
family: candlestick continuation
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLMARUBOZU.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLMARUBOZU.c
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
A long black candle with no, or almost no, shadows: sellers controlled the session from open to close.

## How the author meant it to be used
Nison: a black marubozu opens at the high and closes at the low; bearish, a continuation in a downtrend or a reversal signal after a long advance. ChartSchool defines marubozu generally. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. Automatic; the mark sits on the bar at its close.

## Calculation
Bar: long real body with each shadow at most 5% of the range (OpenCandle); TA-Lib uses a long body, very short upper and lower shadows and signals -100. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
As the white marubozu, mirrored.

## Reading it
Strong bearish momentum candle.

## Common mistakes and edge cases
- Demanding zero shadows.
- Needs a non-zero range.

## How OpenCandle does it
- A long body (above the average body of the previous 14 bars) with both shadows at most 5% of the range. Opening and closing marubozu, which have a shadow on one side, are not detected.
- It is treated as a continuation, so the mark needs a prior downtrend. A black marubozu after a long advance, Nison's reversal use, is not reported. TA-Lib has no trend test.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).

## Open questions
As the white marubozu.
