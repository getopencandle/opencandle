---
id: cdlfallingwindow
name: Falling window (bearish)
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
A gap down between two bars' ranges, read as resistance in a downtrend.

## How the author meant it to be used
Mirror of the rising window (Nison): the high of the current bar is below the prior bar's low, a bearish continuation. The gap acts as resistance. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the bar after the gap at its close.

## Calculation
Condition: high of bar N below the low of bar N-1; trend down; shadow gap.

## Standard defaults
No parameters.

## Reading it
Bearish while price stays under the gap.

## Common mistakes and edge cases
- As the rising window.

## How OpenCandle does it
- A window is a gap between the bars' full ranges (the high of the new bar is below the low of the prior bar), not a gap between bodies.
- Needs a prior downtrend. The mark does not follow later filling of the gap.
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
As the rising window.
