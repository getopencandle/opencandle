---
id: dw-trend-ray
name: Ray
kind: drawing
family: trend lines
sources:
  - title: Trend Lines (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/trend-lines
    type: secondary
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: medium
---

## Purpose
A trend line that starts at one point, passes through a second, and continues without end in that direction. It projects a trend forward to show where support or resistance would sit in the future.

## How the author meant it to be used
The ray is the practical form of the trend line: ChartSchool treats an established trend line as support or resistance to watch as price approaches it. The ray itself is a charting software convention, not a named method of any author.

## How you draw it
Two clicks: point 1 is the origin, point 2 sets the direction. The line runs from point 1 through point 2 and on to the chart edge (to the left edge if point 2 is earlier in time than point 1). It does not extend behind point 1. Hold Shift while placing the second point to lock the angle to 45 degree steps. Both points are draggable: moving point 1 moves the origin and angle, moving point 2 only the angle. Anchors are time and price, so geometry survives interval change.

## Geometry and levels
Origin O=(t1,p1), direction through B=(t2,p2). For t on the ray side, price = p1 + (p2-p1)*(t-t1)/(t2-t1) in the displayed scale. The extension continues across future bars, including time the axis skips. Log scale: store the anchors as time and price and evaluate the line in the displayed scale, so it stays straight and passes through both anchors after a scale switch. ChartSchool notes that highs and lows line up better on semi-log for long-term lines or large moves.

## Standard defaults
One line, no label. Style is user-selectable.

## Reading it
As a trend line, with the future crossing price visible. A projected ray that price has already crossed has become a level that may act the other way.

## Common mistakes and edge cases
- Direction depends on click order: swapping the clicks flips the side it extends to.
- Both clicks at the same time gives a vertical ray, which must not crash.
- The extension must keep reaching the viewport edge after pan and zoom.
- Log scale: see Geometry.

## How OpenCandle does it
- Extends from point 1 through point 2, to the left edge when point 2 is earlier. A vertical ray follows the direction of point 2.
- Hold Shift while placing the second point to lock to 45-degree steps.

## Open questions
- Whether the future extension is in bars or calendar time.
- Book citations in the sources list are background reading and were not re-checked line by line.
