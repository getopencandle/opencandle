---
id: guppy
name: Guppy multiple moving average
kind: indicator
family: moving average ribbon
sources:
  - title: Trading Tactics
    author: Daryl Guppy
    year: 1997
    url: book
    type: primary
  - title: Guppy Multiple Moving Average, an MA Ribbon
    author: StockCharts ChartSchool
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/moving-average-trading-strategies/guppy-multiple-moving-average-an-ma-ribbon-designed-to-tip-the-markets-hand
    type: secondary
confidence: medium
---

## Purpose
Twelve exponential averages in two groups of six, a proxy for short-term traders and longer-term investors.

## How the author meant it to be used
Per ChartSchool: the short group (3, 5, 8, 10, 12, 15) reflects traders and the long group (30, 35, 40, 45, 50, 60) reflects investors. A short ribbon crossing above the long ribbon suggests an uptrend emerging, below suggests a downtrend. Wide separation means a strong trend; convergence means agreement and no trend; compression often precedes a breakout. The gap between the 15 and 30 keeps the groups apart.

## How you interact with it
Automatic overlay of 12 lines. You can change each length and the price source. Each EMA is known at its bar close; no repainting. Ribbon crossings and compression are visual judgements, not computed signals.

## Calculation
Twelve EMAs of the source (close), alpha = 2 / (n + 1). Seeding the first value with the simple average of the first n bars is common practice (TA-Lib, ChartSchool); start-up values differ by seed.

## Standard defaults
Short 3, 5, 8, 10, 12, 15; long 30, 35, 40, 45, 50, 60; source close.

## Reading it
Read ribbon order, spacing and crossings, not single lines. ChartSchool warns that congestion between ribbons can hide a trend, so judge price structure (swing highs and lows) as well.

## Common mistakes and edge cases
- Using simple averages instead of exponential.
- Treating one pair crossing as a signal; the group matters.
- The 60-bar line is missing for the first 59 bars.

## Open questions
The book's exact rules (for example how it defines compression) are not reproduced.
