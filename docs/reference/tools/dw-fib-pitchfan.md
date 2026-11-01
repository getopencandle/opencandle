---
id: dw-fib-pitchfan
name: Pitchfan
kind: drawing
family: Pitchfork
sources:
  - title: Andrews' Pitchfork (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/andrews-pitchfork
    type: secondary
  - title: Fibonacci Fans (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-fans
    type: secondary
confidence: low
---

## Purpose
A fan of rays from the first pivot of a three-point pitchfork, passing through points spaced along the line between the second and third pivots, instead of parallel lines. It tests several slopes between the extreme pivots.

## How the author meant it to be used
Alan Andrews' median line method uses three pivots; the median line runs from point 1 through the midpoint of points 2 and 3 (ChartSchool describes the fork this way). A pitchfan keeps point 1 as the origin but fans rays through other points on the P2-P3 segment, so the median line is the 50 percent ray and the outer rays are the lines through P2 and P3, which ChartSchool calls trigger lines.

## How you draw it
Three clicks in time order. Point 1 is the origin (the start pivot). Points 2 and 3 are the next two pivots of opposite kind. All three are draggable; point 1 controls the overall slope. Every ray starts at point 1 and extends to the right edge. The rays pass through points on the segment P2 to P3 at ratios along it. Geometry is in time and price, so rays stay on their anchors across interval changes. On a log scale the fork should be built in displayed scale.

## Geometry and levels
Ray r passes through P1 and P2 + r * (P3 - P2) for r in a set that includes 0 (through P2), 0.5 (median line) and 1 (through P3). Fibonacci variants add 0.236, 0.382, 0.618, 0.786. Ratios outside 0 to 1 extend beyond P2 or P3.

## Standard defaults
Sources differ. Common practice is a median line plus Fibonacci rays; OpenCandle draws the three median-style rays only.

## Reading it
As in a pitchfork, price tends to return to the median line, and the other rays are alternative paths. A break of an outer ray is read as a trend change.

## Common mistakes and edge cases
- Treating a pitchfan as a parallel-line pitchfork.
- Point 2 and point 3 at the same time (vertical segment) makes the rays steep.
- Using the wrong pivot order.

## How OpenCandle does it
- Draws three rays from the pivot (through P2, the P2-P3 midpoint and P3) plus the P2-P3 line, in pixels.
- There are no Fibonacci level rays and no level editor.

## Open questions
- The ratio list and whether the median line is always drawn.
- ChartSchool pages on Andrews' pitchfork and Fibonacci fans are the background; the fan form itself has no published source.
