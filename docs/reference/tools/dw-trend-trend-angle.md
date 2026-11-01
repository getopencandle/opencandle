---
id: dw-trend-trend-angle
name: Trend angle
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
A trend line that displays its own angle in degrees from the horizontal, showing how steep the trend is.

## How the author meant it to be used
ChartSchool stresses angle: as steepness increases the validity of the support or resistance level decreases, and chart size and amount of data affect the angle. The angle is therefore a screen-dependent reading used to flag lines too steep to last. The tool has no named author.

## How you draw it
Two clicks: point 1 is the vertex, point 2 sets the direction. The angle is measured between the horizontal through point 1 and the segment to point 2. Both points are draggable. The optional snap (Shift) constrains the second point to 45 degree multiples while drawing. A small arc or label at point 1 shows the angle.

## Geometry and levels
Angle = atan2(dy_pixels, dx_pixels), positive upward, between -90 and +90 for a left-to-right line. It is computed in pixel space, so it changes with zoom, the visible price range and pane size even though the anchors do not. The line is a segment through A and B, not extended. Log scale: store the anchors as time and price and evaluate the line in the displayed scale, so it stays straight and passes through both anchors after a scale switch. ChartSchool notes that highs and lows line up better on semi-log for long-term lines or large moves.

## Standard defaults
Angle label in degrees with one decimal; a horizontal reference from point 1.

## Reading it
A rising line near 45 degrees is often considered more sustainable and steeper lines tend to break (qualitative; ChartSchool gives no numeric threshold). The angle has no meaning across different charts.

## Common mistakes and edge cases
- Treating the angle as stored data: it is a display property; the stored data are the two anchors.
- Up is positive.
- Point 2 left of point 1: say which convention is used.
- Zero-length line.
- Snap works in screen space, not price-time space.

## How OpenCandle does it
- The angle is measured on screen in pixels, to one decimal, so it changes with zoom and pane size.
- A line pointing left reads 90 to 180 degrees (or -90 to -180). The dashed baseline always points right.
- Shift snaps in screen space.

## Open questions
- Whether the angle is measured in pixels or in an idealised price-bar space.
- No primary source; content is convention.
