---
id: cdlrisingwindow
name: Rising window (bullish)
kind: pattern
family: candlestick continuation
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
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
A gap up between two bars' price ranges, read as support in an uptrend.

## How the author meant it to be used
Nison: a window (the Japanese 'mado') is a gap. A rising window is a bullish continuation: the low of the current bar is above the previous bar's high. The gap acts as support, and he expects its lower edge (the prior high) to hold on a pullback; a close back through the window warns the trend may fail. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the bar after the gap at its close. The mark does not track later filling of the gap.

## Calculation
Condition: low of bar N above the high of bar N-1; trend up. Shadows count, so it is a shadow gap, not a body gap.

## Standard defaults
No parameters; trend rule applies.

## Reading it
Bullish while price holds above the gap.

## Common mistakes and edge cases
- Using body-only gaps; a window is a full range gap.
- Treating every gap as a rising window; exhaustion gaps at the end of a trend are different.
- 24-hour markets rarely gap.

## How OpenCandle does it
- A window is a gap between the bars' full ranges (the low of the new bar is above the high of the prior bar), not a gap between bodies.
- Needs a prior uptrend. The mark does not follow later filling of the gap.
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
Gap filling is not tracked by the signal itself.
