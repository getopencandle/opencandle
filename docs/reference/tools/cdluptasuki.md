---
id: cdluptasuki
name: Upside Tasuki gap (bullish)
kind: pattern
family: candlestick continuation
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLTASUKIGAP.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLTASUKIGAP.c
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
Three-bar bullish continuation: two white bars with a gap up, then a black bar that dips into the gap without closing it.

## How the author meant it to be used
Nison: in an uptrend, a white bar, then a white bar that gaps up, then a black bar that opens inside the second white body and closes inside the gap without filling it. The gap should hold as support; filling it makes the pattern fail. ChartSchool: a long white body followed by a gapped white, then a black that opens in the second body and closes in the gap without closing it. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the third bar at its close. A continuation pattern, so a bullish mark needs an uptrend.

## Calculation
Bars 1 and 2 white with a gap up (OpenCandle: between ranges; TA-Lib: between real bodies); bar 3 black, opens inside bar 2's body, closes inside the gap. TA-Lib also requires the bodies of bars 2 and 3 to be near the same size and does not require bar 1 to be white. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
None beyond trend.

## Reading it
Support at the gap; a close through the gap cancels the pattern.

## Common mistakes and edge cases
- Closing the gap fully (that is not a tasuki).
- Mixing shadow gaps and body gaps.
- TA-Lib's body-size similarity test is not part of the usual descriptions.

## How OpenCandle does it
- The gap is a shadow gap: the second bar's low is above the first bar's high. TA-Lib uses a gap between bodies.
- The third bar is black, opens inside the second body and closes inside the gap. Bar 1 must be white, and the bodies of bars 2 and 3 need not be similar in size.
- A continuation pattern, so the bullish mark needs a prior uptrend, read on the bar before the first bar.
- The mark is drawn on the pattern's last bar and uses only that bar and the ones before it, so it never repaints once the bar has closed.

## Open questions
Which gap definition Nison intended (shadows or bodies) is not settled by the sources.
