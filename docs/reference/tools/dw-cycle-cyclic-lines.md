---
id: dw-cycle-cyclic-lines
name: Cyclic lines
kind: drawing
family: Cycles
sources:
  - title: Stock Market Cycles (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/stock-market-cycles
    type: secondary
confidence: medium
---

## Purpose
Vertical lines repeated at an equal time spacing to project a cycle's next lows or highs into the future.

## How the author meant it to be used
No single author. ChartSchool: a market cycle is an event such as a price high or low that repeats regularly; lows are normally used to define cycle length and project future lows, and cycles "tend to change over time and can even disappear". Its recipe: place a vertical line on the first cycle low, count the cycle length, place a second line, and repeat the same spacing. It recommends a log scale and checking with a detrended price oscillator. Cycles are best combined with other tools; they do not pinpoint turns exactly.

## How you draw it
Two clicks, left to right: point 1 on one cycle low (or high), point 2 on the next. The distance between them (in bars) is the cycle length. Lines repeat at that spacing to the right (and optionally to the left). Both points can be dragged; dragging point 2 changes the length and all lines move. Spacing is in bars, not calendar time, so holidays and weekends are skipped. Anchored to bars; across interval change the lines stay on their bars while the count between them follows the data. Price of the points is irrelevant, and log scale does not affect it.

## Geometry and levels
Line k at x = x1 + k * (x2 - x1). Half-cycle and harmonic lines are not drawn by default.

## Standard defaults
Equal spacing from the first two clicks; lines extend over the visible and future area.

## Reading it
Look for highs and lows near the lines. Cycle high should fall somewhere between two lows (translation). Several cycles that trough together (nesting) strengthen a low. Right translation is the tendency of peaks to come late in a bull market.

## Common mistakes and edge cases
- Using calendar days when the tool counts bars.
- Keeping a cycle after it has stopped working (inversion or loss of cycle).
- Setting both points on one bar gives zero spacing.

## How OpenCandle does it
- Verticals at P1 + k x (P2 - P1) for k = 0, 1, 2 and so on. Forward only, never left of P1.
- Spacing is in bars.

## Open questions
- Whether OpenCandle extends lines to the left as well.
- Book citations in the sources list are background reading. No primary source for the tool.
