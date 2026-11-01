---
id: cdlthreewhitesoldiers
name: Three white soldiers (bullish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDL3WHITESOLDIERS.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDL3WHITESOLDIERS.c
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
Three consecutive long white bars, each closing higher, marking a strong start to an advance.

## How the author meant it to be used
Nison: three long white bodies, each closing higher, each opening within the prior body, each closing at or near its high; typically after a decline or consolidation. He warns of the advance block and deliberation variants, where bodies shrink or shadows lengthen, signalling fatigue. ChartSchool: each should open within the previous body and close near the high. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the third bar at its close.

## Calculation
Three white bars; rising closes; each open within the previous real body; upper shadow at most 25% of range (OpenCandle) or very short (TA-Lib); bodies long in OpenCandle (TA-Lib requires not short, and a body not far smaller than the previous). TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Upper shadow limit 25% (OpenCandle).

## Reading it
A strong advance start; late in a trend it can be exhausting (advance block).

## Common mistakes and edge cases
- Allowing opens above the prior close by more than a small gap.
- Not checking that bodies do not shrink drastically.
- Counting it after a large advance, where it is more of a blow-off.

## How OpenCandle does it
- Each bar must have a long body (larger than the average body of the 14 bars before it) and an upper shadow of at most 25% of its range.
- Each open must be inside the previous body, edges included. The advance-block check (bodies shrinking) that TA-Lib applies is not used.
- Needs a prior downtrend, read on the bar before the first soldier.
- The mark is drawn on the pattern's last bar and uses only that bar and the ones before it, so it never repaints once the bar has closed.

## Open questions
Nison's own tolerance for near the high is unverified.
