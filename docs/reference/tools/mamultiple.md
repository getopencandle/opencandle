---
id: mamultiple
name: Moving average multiple
kind: indicator
family: moving averages
sources:
  - title: ChartSchool, Moving Averages (simple and exponential)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-averages-simple-and-exponential
    type: secondary
  - title: ChartSchool, Moving Average Ribbon
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-average-ribbon
    type: secondary
confidence: medium
---

## Purpose
Shows several moving averages of the same source on one chart, so trend and the spacing between horizons can be seen together.

## How the author meant it to be used
No single author. ChartSchool says there are no special formulas: each average is a standard SMA or EMA and reading is the same as for one or two averages (direction, price crossing, shorter crossing longer), applied across several horizons. Parallel lines mean a strong trend; shorter lines crossing longer ones signal a turn.

## How you interact with it
Automatic. You choose one average type (SMA, EMA, WMA or Wilder-style RMA), up to six lengths, and the source. Each line can be hidden. Nothing is placed. All lines use only past data; no repaint.

## Calculation
SMA = mean of the last N values. EMA = alpha x price + (1 - alpha) x prior EMA, alpha = 2/(N+1), seeded with the SMA of the first N values (ChartSchool and TA-Lib convention). WMA weights N..1, newest heaviest. RMA (Wilder) uses alpha = 1/N. Each average is undefined until its own window fills.

## Standard defaults
No convention. OpenCandle: SMA with lengths 5, 10, 20, 50, 100, 200.

## Reading it
Line order (shortest above longest in an uptrend), slope, and crossings. A wide fan means a strong trend, a tangle means a range.

## Common mistakes and edge cases
- Seeding the EMA with the first price rather than the SMA changes early values.
- Mixed types per line are not part of this tool.
- Long averages need long history; the 200 line is blank for the first 199 bars.

## How OpenCandle does it
- All lines share one average type (SMA by default, with lengths 5, 10, 20, 50, 100 and 200). You cannot mix types per line.
- EMA lines start from a simple average of the first N values. Each line is blank until its own window fills.

## Open questions
Defaults are OpenCandle-chosen.
