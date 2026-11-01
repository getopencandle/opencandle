---
id: dw-pattern-triangle-pattern
name: Triangle pattern
kind: drawing
family: Chart pattern
sources:
  - title: Symmetrical Triangle (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/symmetrical-triangle
    type: secondary
  - title: Ascending Triangle (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/ascending-triangle
    type: secondary
  - title: Technical Analysis of Stock Trends
    author: Robert D. Edwards and John Magee
    year: 1948
    url: book
    type: primary
  - title: Encyclopedia of Chart Patterns
    author: Thomas N. Bulkowski
    year: 2005
    url: book
    type: secondary
confidence: medium
---

## Purpose
Marks four swing points (A, B, C, D) of a triangle consolidation and the two boundary lines that converge at an apex.

## How the author meant it to be used
Edwards and Magee classed triangles as consolidation patterns; ChartSchool says about 75 percent of symmetrical triangles continue the prior trend and the rest reverse (it attributes this to Edwards and Magee). A symmetrical triangle needs at least two lower highs and two higher lows, with the lines converging. An ascending triangle has a horizontal top and rising lows (bullish bias); a descending triangle has a horizontal bottom and falling highs. The direction can only be known after a closing break; volume should fall inside the pattern and rise on the breakout. The ideal breakout is one half to three quarters of the way from the base to the apex. After the break the apex can become support or resistance. Targets: the widest part of the triangle projected from the break point, or a trend line parallel to the pattern's line drawn from the first pivot.

## How you draw it
Four clicks in time order: A, B, C, D alternating high and low (for example high, low, high, low). The boundary lines run A to C and B to D and are extended to their apex if they converge (OpenCandle draws them to the apex, or stops at the last point if they diverge or are parallel). All four points can be dragged. The shape is anchored in time and price and stays on its bars across interval changes. The apex can lie beyond the last bar, so future space is needed to see it. On a log scale the lines should be drawn in displayed scale.

## Geometry and levels
Upper line through A and C, lower through B and D (when A is a high). Apex is where the two lines intersect. For a symmetrical triangle the highs fall and the lows rise. Width at the left is the vertical distance between the lines at the first pivot. Breakout fraction = (break time minus start) / (apex time minus start).

## Standard defaults
OpenCandle tints the triangles A-B-C and B-C-D and draws the lines to the apex. The sources describe only the four-point minimum, with six points ideal.

## Reading it
Wait for a closing break with volume; do not guess direction in advance. A break too close to the apex tends to be weak.

## Common mistakes and edge cases
- Parallel or diverging lines are not a triangle (a rectangle or a broadening pattern).
- Treating a touch of a line as a break; ChartSchool says closing basis, with optional filters like 3 percent or 3 days.
- Four points are the minimum; a pattern with fewer touches is weak evidence.

## How OpenCandle does it
- Four points A to D. Boundary lines A-C and B-D run to the apex when it lies ahead, otherwise to the last point's bar. Triangles A-B-C and B-C-D are tinted.

## Open questions
- Whether OpenCandle checks that the lines converge or only draws them.
- Verification status: ChartSchool symmetrical and ascending triangle pages were consulted, plus the descending page.
