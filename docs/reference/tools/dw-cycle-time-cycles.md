---
id: dw-cycle-time-cycles
name: Time cycles
kind: drawing
family: Cycles
sources:
  - title: Stock Market Cycles (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/stock-market-cycles
    type: secondary
confidence: low
---

## Purpose
A row of arcs or half circles laid along the time axis, one per cycle length, to show projected cycles and where each cycle's low and high fall.

## How the author meant it to be used
No single author. ChartSchool names three cycle annotations: cycle lines, cycle circles and sinewaves, and says a cycle's length is measured between lows, with the cycle high expected somewhere between. A time cycle tool is the arc form: each arc spans one cycle, rising from one cycle low to the next, with the apex marking the cycle's midpoint. This is one common reading.

## How you draw it
Two clicks, left to right: point 1 on a cycle low and point 2 on the next low (or the span of the first arc). Both are draggable; the span is the cycle length in bars. Arcs repeat to the right with the same span. Anchored in time and price; across interval change they stay on their bars. Height of the arcs is typically fixed in pixels or comes from the price span of the points. Arcs are drawn in screen space so they depend on the pane's size. Bars, not calendar time, set the span.

## Geometry and levels
Arc k spans x1 + k * (x2 - x1) to x1 + (k + 1) * (x2 - x1). The apex sits at the mid-time of each arc. No price levels.

## Standard defaults
Several repeated arcs; style options differ by tool.

## Reading it
Cycle lows are expected where arcs meet; highs near the arc tops, though in practice peaks come before or after the midpoint (translation).

## Common mistakes and edge cases
- Taking arc height as an amplitude forecast; it is only decoration.
- Zero-span arcs when both points share a bar.
- Using a cycle length that no longer fits.

## How OpenCandle does it
- Half ellipses starting at P1, as wide as P1-P2 and as tall as the price gap (a half circle when the gap is zero), repeated forward. The height rule is OpenCandle's own.

## Open questions
- What controls arc height.
- How the tool differs from cyclic lines in OpenCandle.
- Verification status: the ChartSchool cycles page was consulted for the cycle concept; the tool itself was not described. Confidence is low.
