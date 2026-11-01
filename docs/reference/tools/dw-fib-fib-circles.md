---
id: dw-fib-fib-circles
name: Fib circles
kind: drawing
family: Fibonacci
sources:
  - title: Fibonacci Arcs (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-arcs
    type: secondary
  - title: Stock Market Cycles (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/stock-market-cycles
    type: secondary
confidence: low
---

## Purpose
Full circles at Fibonacci multiples of a base distance, used as combined price and time support and resistance zones. It is the full-circle sibling of Fibonacci arcs.

## How the author meant it to be used
No author is known. ChartSchool describes Fibonacci arcs as half circles of radius 0.382, 0.5 and 0.618 of a base line that add a time element to retracements. Fib circles are the same idea with complete circles; The tool's reliability is questionable because a circle's meaning depends on the chart's aspect ratio.

## How you draw it
Two clicks. Point 1 and point 2 are the ends of the base line. Sources differ on the centring: some centre the circles on the midpoint of that line, others on point 1 with the line's length as the radius. OpenCandle centres on point 1, so a ratio of 1 reaches point 2. Both points can be dragged and the whole set rescales. Circles are drawn in screen space from price and time, so they are round on screen but distorted in data units; changing the visible price range, zooming or switching the interval or scale changes their apparent shape (they stay attached to the anchor bars and prices). On a log scale the circle is drawn using the log-transformed vertical position.

## Geometry and levels
Centre C = midpoint of the two points in screen coordinates. Radius for ratio r = r * |P2 - P1| / 2. Typical ratios: 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618.

## Standard defaults
Tools differ; a Fibonacci ratio set that includes 0.382, 0.5, 0.618 and 1 is typical.

## Reading it
Price touching a circle is read as support or resistance in the same way as an arc. The intersection with the base line is the point to watch.

## Common mistakes and edge cases
- Expecting circles to be circles in data units; they are circles in pixels only.
- Resizing the chart pane changes the picture.
- Choosing a base line that is almost horizontal or vertical makes circles degenerate to flat ellipses in data terms.

## How OpenCandle does it
- Centred on point 1 with radius equal to the distance to point 2 (ratio 1 passes through point 2), in pixels. Levels run from 0.236 to 2.618.

## Open questions
- Centring and radius definition for this tool.
- Whether circles are meant to be anchored in pixels or data units.
- Only the ChartSchool arcs and cycles pages cover this tool. The circle construction here is unverified common practice.
