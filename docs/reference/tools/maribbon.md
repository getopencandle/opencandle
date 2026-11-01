---
id: maribbon
name: Moving average ribbon
kind: indicator
family: moving averages
sources:
  - title: ChartSchool, Moving Average Ribbon
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-average-ribbon
    type: secondary
confidence: medium
---

## Purpose
A set of moving averages of one type with steadily increasing lengths, drawn together so spread and order show the strength of a trend.

## How the author meant it to be used
No inventor identified. ChartSchool: a ribbon is a quick way to plot many averages, with no special formulas. If all lines point the same way the trend is strong; shorter lines crossing above longer ones signals a new uptrend and the reverse a downtrend; evenly spaced parallel lines mean a strong trend, and the width between lines carries information too. ChartSchool's builder takes a shortest length, a constant increment and a count (example: 8 EMAs from 10 to 80 in steps of 10).

## How you interact with it
Automatic. You pick the type (SMA, EMA, RMA or WMA), four lengths and the source. Nothing placed; values use past bars only.

## Calculation
Each line is the standard average of its length (EMA seeded by the SMA of the first N values). A line is blank until its window fills.

## Standard defaults
OpenCandle: SMA, lengths 20/50/100/200 (OpenCandle-chosen). The classic ribbon is evenly spaced lengths, so OpenCandle's uneven set behaves more like a multi-average.

## Reading it
All lines rising and ordered short over long = uptrend. Lines compressing = trend fading; crossing = possible change.

## Common mistakes and edge cases
- Lengths not increasing in order make the ordering read wrong.
- Mixing averaging types.
- Early bars show only the short lines.

## How OpenCandle does it
- Default is an SMA ribbon with four lengths: 20, 50, 100 and 200. The classic ribbon uses evenly spaced lengths, so this one behaves more like a multi-average.
- EMA lines start from a simple average of the first N values. Each line is blank until its own window fills.

## Open questions
Count and increment entry, as in the ChartSchool builder, is not offered.
