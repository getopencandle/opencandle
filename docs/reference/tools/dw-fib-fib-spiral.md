---
id: dw-fib-fib-spiral
name: Fib spiral
kind: drawing
family: Fibonacci
sources:
  - title: Fibonacci Arcs (ChartSchool, Fibonacci sequence and golden ratio background)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-arcs
    type: secondary
  - title: Golden spiral as a logarithmic spiral
    author: general mathematics
    year: 2024
    url: book
    type: secondary
confidence: low
---

## Purpose
A golden (Fibonacci) spiral laid over the chart, used as a visual guide for how a move may expand or contract in price and time.

## How the author meant it to be used
No author in technical analysis is known; the available sources only give the Fibonacci sequence and golden ratio background (ratio near 1.618, found in nature and art). The golden spiral grows by a factor of phi (1.618) every quarter turn, which is the geometric basis for the drawing. Whether it has predictive value is not supported by the available sources.

## How you draw it
Two clicks. Common practice: point 1 is the centre of the spiral and point 2 sets the first radius and starting direction. Both points can be dragged. The spiral winds outward from the centre for several turns. Because the shape depends on the pixel aspect ratio, a different zoom or price range changes the apparent shape, though the anchors stay on their bars and prices. Interval change keeps the anchor bars. On a log scale the vertical placement follows the displayed scale.

## Geometry and levels
In polar form r = a * phi^(2 * theta / pi), with theta in radians from the starting direction; a is set by the distance from the centre to point 2. The step per quarter turn is 1.618. There are no price levels, only the curve.

## Standard defaults
Several turns, one direction (counterclockwise or clockwise is your choice in some tools).

## Reading it
Used as a rough visual guide; turning points near where the spiral crosses prior highs or lows are taken as notable, with no firm rules.

## Common mistakes and edge cases
- Expecting the spiral to be a precise forecast.
- Choosing a very short radius, which makes the spiral tiny.
- Expecting the same shape after a change of pane size.

## How OpenCandle does it
- Centre at point 1, edge at point 2, growing by phi each quarter turn, drawn from near the centre to half a turn past point 2.
- On screen the winding is clockwise only.

## Open questions
- Direction and orientation conventions in this tool.
- Number of turns drawn.
- Only the ChartSchool background on the Fibonacci sequence covers this tool. The mathematical form is standard but its use in this tool is unverified.
