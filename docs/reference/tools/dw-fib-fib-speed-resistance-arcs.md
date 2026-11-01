---
id: dw-fib-fib-speed-resistance-arcs
name: Fib speed resistance arcs
kind: drawing
family: Fibonacci
sources:
  - title: Fibonacci Arcs (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-arcs
    type: secondary
  - title: Speed Resistance Lines (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/speed-resistance-lines
    type: secondary
confidence: medium
---

## Purpose
Half circles centred on the end of a measured move, with radii at Fibonacci fractions of the move's length, to mark support or reversal zones that move with time.

## How the author meant it to be used
No named inventor in the sources. ChartSchool: "Fibonacci Arcs are half circles that extend out from a trend line." The first and third arcs use 0.382 and 0.618, the middle arc 0.5, all as fractions of a base line from the trough to the peak (or peak to trough). After an advance the arcs mark support to watch on the pullback; after a decline they mark resistance for a bounce. The arcs add time to retracements: a long base line over a long period gives wide arcs, and a retracement tool shows static price levels where arcs show levels that evolve with time. "Speed resistance" in the name refers to adding the Gould-style 1/3 and 2/3 fractions as an option; that part is a software combination.

## How you draw it
Two clicks. Point 1 and point 2 are the trough and peak (or reverse). Both can be dragged. The base line runs between them. The arcs are centred on the second point, as in the classic definition (OpenCandle does this), and open back towards the first point so each arc crosses the base line at its Fibonacci fraction. Radii scale with the base line length measured on screen, so the picture depends on the chart's pixel aspect ratio. Anchors stay on their bars and prices across interval changes. On log scale the vertical position follows the displayed scale.

## Geometry and levels
Radius for ratio r = r * |P2 - P1| in screen coordinates; the arc is the half circle on the side of point 1. ChartSchool defaults: 0.382, 0.5, 0.618. Many tools add 1.0 and further ratios.

## Standard defaults
0.382, 0.5, 0.618 (ChartSchool). Others depend on the tool.

## Reading it
ChartSchool's Home Depot example shows price reversing near the third arc (61.8 percent). Arcs after an advance rise slowly with time (support), arcs after a decline fall slowly (resistance).

## Common mistakes and edge cases
- Using arcs without noticing that stretching the chart horizontally changes where they fall.
- Centring on point 1 instead of point 2.
- Expecting arcs to be circles in data units.

## How OpenCandle does it
- Centred on the second point, a half circle opening toward point 1, with radius ratio x the length of the line in pixels.
- Defaults include 0.236, 0.786, 1, 1.618 and 2.618 on top of 0.382, 0.5 and 0.618.

## Open questions
- Whether the Gould-style 1/3 and 2/3 fractions are intended as extra radii or the default set.
- Verification status: the ChartSchool arcs and speed resistance pages were consulted. The "speed resistance" arc variant is not described in them.
