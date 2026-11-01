---
id: autotrendlines
name: Auto trendlines
kind: indicator
family: trendlines
sources:
  - title: ChartSchool, Trend Lines
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/trend-lines
    type: secondary
  - title: Technical Analysis of Stock Trends
    author: Robert D. Edwards and John Magee
    year: 1948
    url: book
    type: primary
confidence: low
---

## Purpose
Automatically draws support and resistance trendlines through swing pivots of two sizes (Small and Large), and ends a line when price breaks it.

## How the author meant it to be used
Classic trendline theory (Edwards and Magee, and ChartSchool): an uptrend line connects two or more lows with each higher than the last and acts as support; a downtrend line connects highs, each lower, and acts as resistance. Two points draw a line, but at least three touches are needed for it to be considered valid. A break shows a weakening of demand (uptrend) or supply (downtrend). ChartSchool recommends a semi-log scale for long-term lines or big price changes, so that percent moves look equal. 

## How you interact with it
Automatic, visual only. Lines are built in linear price and bar index. Inputs: line size (Small, Large, Both), bars to breakout (3), show pivots. It draws on the chart bars only. No values and no alerts. Pivots are confirmed only with their full right side, so a line never uses an unfinished swing; a line is drawn from its two pivots and extends right as a ray until broken, then it stops at the bar that completes the break. New lines can appear and the set of lines can change as new pivots confirm.

## Calculation
OpenCandle-defined: pivot radius (Small 5, Large 25 bars each side) with a zig zag filter of 2 (Small) or 5 (Large) times ATR(14); the newest few pivots per side serve as anchors, with at most a few lines per size and side. A line breaks when the close is strictly beyond it for the set number of consecutive closes; an equal close resets the count. Only the newest 5000 bars are searched.

## Standard defaults
Both sizes, 3 bars to breakout, pivots hidden.

## Reading it
Support lines (rising lows) and resistance lines (falling highs). A break followed by a retest can flip the line's role. Lines of Large size are more significant than Small.

## Common mistakes and edge cases
- Using a pivot before it has a full right side (look-ahead).
- Counting a wick as a break rather than consecutive closes.
- Measuring lines in linear price on a log-scale chart (OpenCandle does this, so lines can look bent on a log scale).
- Fewer than three touches means weak validity.

## How OpenCandle does it
- Lines are built in linear price and bar index, so on a log-scale chart they look bent.
- A line breaks when the close is strictly beyond it for the chosen number of consecutive closes (default 3). An equal close resets the count.
- Which lines are drawn depends on all the history in the newest 5000 bars, so the set of lines can change as bars arrive.
- Pivot size Small uses 5 bars each side and a zig zag filter of 2 x ATR(14); Large uses 25 bars and 5 x ATR(14).

## Open questions
All detection constants are OpenCandle's own.
