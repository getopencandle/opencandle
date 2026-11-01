---
id: dw-trend-extended-line
name: Extended line
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
A line through two points that extends without end in both directions across the chart. Used when a trend or level must be read at any time, before and after the anchors.

## How the author meant it to be used
The infinite version of the trend line. Extending a line right to see where price meets it is standard practice (ChartSchool treats trend lines as support and resistance projected ahead). Extending left is convention, to see how long the line was respected.

## How you draw it
Two clicks: point 1 and point 2 define the line, which runs through both to both chart edges. Hold Shift while placing the second point to lock the angle to 45 degree steps. Both points are draggable and the body moves the line. Anchors are time and price, so it stays through the same points on interval change.

## Geometry and levels
Line through A=(t1,p1) and B=(t2,p2); price at any t is p1 + (p2-p1)*(t-t1)/(t2-t1) in the displayed scale. Log scale: store the anchors as time and price and evaluate the line in the displayed scale, so it stays straight and passes through both anchors after a scale switch. ChartSchool notes that highs and lows line up better on semi-log for long-term lines or large moves. On a linear scale a steep left extension can go below zero; on a log scale a non-positive value cannot be drawn, so the line must stop there.

## Standard defaults
Plain line; no labels or arrows by default.

## Reading it
As a trend line: respect or break of the line as support or resistance. The left extension shows how long it held.

## Common mistakes and edge cases
- Two clicks at the same time give a vertical line; at the same price a horizontal line. Both must render.
- Dragging the body moves both points and preserves the slope.
- Zooming out must still reach the edges.
- Log scale: do not draw non-positive values.

## How OpenCandle does it
- Hold Shift while placing the second point to lock to 45-degree steps.

## Open questions
- Whether extension is unlimited or capped by a bar count.
- Book citations in the sources list are background reading and were not re-checked line by line.
