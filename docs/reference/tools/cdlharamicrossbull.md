---
id: cdlharamicrossbull
name: Harami cross (bullish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLHARAMICROSS.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLHARAMICROSS.c
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
A harami whose second bar is a doji, after a decline; read as a stronger sign of exhaustion than a plain harami.

## How the author meant it to be used
Nison: the harami cross has a doji as the second bar, wholly inside the long first body. A doji shows complete indecision after a trend, so he treats the harami cross as a more important warning than the plain harami; at tops it is a notable bearish sign. ChartSchool: same as harami but the last day is a doji. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the second bar at its close.

## Calculation
Bar 1 black and long; bar 2 a doji (body at most 5% of its range in OpenCandle) whose body lies inside bar 1's body; trend down. TA-Lib uses a 10% of range doji average. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Doji body at most 5% of range (OpenCandle).

## Reading it
A stronger warning than a harami, still not a signal alone.

## Common mistakes and edge cases
- Requiring the doji's shadows inside bar 1.
- Accepting a doji as the first bar.
- A long-legged doji passes the body test.

## How OpenCandle does it
- Bar 2 is a doji (body at most 5% of its own range; TA-Lib uses 10% of the average range) inside bar 1's body. Touching edges count as inside, and bar 1 must be a long black body.
- Needs a prior downtrend.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
The sources do not say which doji sub-types suit the harami cross best.
