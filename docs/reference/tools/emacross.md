---
id: emacross
name: EMA cross
kind: indicator
family: moving average
sources:
  - title: ChartSchool, Moving Averages - Simple and Exponential
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-averages-simple-and-exponential
    type: secondary
  - title: Moving average crossover system (common charting practice, no single author)
    author: unknown
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
Plots a short and a long EMA and marks the bars where the short crosses the long, as a basic trend-change signal.

## How the author meant it to be used
No single author. The crossover is the oldest moving-average signal: a faster average crossing above a slower one marks a turn up, and below marks a turn down. ChartSchool discusses crossovers of moving averages as trend-following signals that lag price and whipsaw in ranges. The markers in OpenCandle are an OpenCandle addition on top of the two lines.

## How you interact with it
Automatic. Inputs: short length (9), long length (26), source. The cross markers appear after the bar closes (bar close value). A bar that crosses intrabar but closes back does not count, so a marker can disappear while the bar is still forming.

## Calculation
Both lines are EMAs with factor 2/(N+1), SMA-seeded in OpenCandle. Cross up on a bar where (short - long) is above 0 and was 0 or below on the bar before; cross down mirrors. A missing average on either bar gives no marker, so the first possible cross is one bar after both EMAs exist.

## Standard defaults
9 and 26 (OpenCandle). Other popular pairs are 12/26, 20/50 and 50/200, the last called golden/death cross on daily bars.

## Reading it
Up cross is bullish bias, down cross is bearish bias; longer pairs are slower and fewer.

## Common mistakes and edge cases
- Counting a touch (equal values) as a cross; a cross needs a sign change from 0 or below to above 0.
- Treating a marker on the forming bar as final.
- Expecting it to work in sideways markets.

## How OpenCandle does it
- Both EMAs are seeded with a simple average. Defaults are 9 and 26.
- A touch counts: a difference that goes positive, to exactly zero, then positive again marks a cross up on the third bar.

## Open questions
Whether a bar where the difference is exactly zero then moves back counts is implementation-specific.
