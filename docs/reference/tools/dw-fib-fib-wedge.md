---
id: dw-fib-fib-wedge
name: Fib wedge
kind: drawing
family: Fibonacci
sources:
  - title: Fibonacci Arcs (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-arcs
    type: secondary
confidence: low
---

## Purpose
A wedge of arcs and rays that fans out from one point, combining Fibonacci radii with an angular sweep, to mark support and resistance zones in price and time.

## How the author meant it to be used
No author is known and no published source describes this tool. It is a software construction that sits between Fibonacci arcs (which ChartSchool describes as half circles at 0.382, 0.5 and 0.618 of a base line) and a fan. The description below is common practice.

## How you draw it
Three clicks, as most tools do. Point 1 is the centre (the apex). Point 2 sets the radius (and the starting direction of one edge of the wedge). Point 3 sets the angular extent: the other edge points at point 3. All three can be dragged. Arcs are drawn between the two edges at Fibonacci fractions of the radius, and the two edge rays run from the centre. Geometry is computed in screen space, so the wedge depends on the pane's pixel aspect ratio. Anchors stay on their bars and prices across interval changes; log scale uses displayed vertical positions.

## Geometry and levels
Radius for ratio r = r * |P2 - P1|, arc from the angle of P2 to the angle of P3 about P1. Ratios are the usual Fibonacci set (0.236, 0.382, 0.5, 0.618, 0.786, 1) by convention.

## Standard defaults
Fibonacci fractions of the radius, with the two edge rays drawn.

## Reading it
Price touching an arc inside the wedge is read as support or resistance, as with arcs. The wedge edges act like trend lines.

## Common mistakes and edge cases
- Putting point 3 on the same ray as point 2 gives a zero angle.
- Expecting the same picture after resizing the pane.
- Placing the centre at the end rather than the start of the move.

## How OpenCandle does it
- Apex, radius and angle; arcs at 0.236 to 1 between the two edges.

## Open questions
- The exact construction (what point 3 controls).
- Default ratio set.
- No source describing this specific tool was found. Confidence is low.
