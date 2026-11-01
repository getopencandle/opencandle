---
id: dw-trend-info-line
name: Info line
kind: drawing
family: trend lines
sources:
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: medium
---

## Purpose
A trend line segment that also displays measurements of the move between its two points: price change, percent change and number of bars.

## How the author meant it to be used
No single author; it is a software convention that adds a measuring label to a trend line. The measurements are textbook: change = p2 - p1, percent = (p2 - p1)/p1 x 100, bars = difference of bar indices.

## How you draw it
Two clicks like a trendline: point 1, point 2. Hold Shift while placing the second point to lock the angle to 45 degree steps. Both are draggable and the body moves the segment; the label updates live. The line is a segment, not extended. Anchors are stored in time and price. The bar count is recomputed from the current interval, so it changes when the interval changes while price change and percent do not.

## Geometry and levels
Segment A=(t1,p1) to B=(t2,p2). Price change signed; percent relative to point 1 (so reversing the points gives a different percent); bars counted as plotted bars between the two times (adjacent bars = 1). Log scale: store the anchors as time and price and evaluate the line in the displayed scale, so it stays straight and passes through both anchors after a scale switch. ChartSchool notes that highs and lows line up better on semi-log for long-term lines or large moves.

## Standard defaults
A label near the line showing change with percent and bars.

## Reading it
Used to size swings, compare a rally with the prior decline, count bars in a move, and estimate speed (change per bar). ChartSchool warns that chart size and data amount change line angles, so the angle is not comparable between charts.

## Common mistakes and edge cases
- Percent base is point 1.
- Bar count must count plotted bars, not calendar days.
- Equal prices give 0 percent and 0 degrees; zero distance is degenerate.

## How OpenCandle does it
- Shows the signed change in price (in the instrument's decimals), the percent of point 1 and the bar count. It has no elapsed-time or angle field.
- The bar count is an unsigned rounded difference. Bars beyond the last bar are counted by calendar interval, so weekend days count as future bars.
- With a zero starting price the percent is shown as +0.00%.
- Hold Shift while placing the second point to lock to 45-degree steps.
- A point anchored inside the newest bar snaps to that bar.

## Open questions
- Which label fields OpenCandle shows by default.
- Whether the bar count includes both endpoints (convention is the index difference).
- No primary source exists; the content is convention.
