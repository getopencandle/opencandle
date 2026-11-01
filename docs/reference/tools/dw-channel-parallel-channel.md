---
id: dw-channel-parallel-channel
name: Parallel channel
kind: drawing
family: channels
sources:
  - title: Trend Lines (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/trend-lines
    type: secondary
  - title: Technical Analysis of Stock Trends
    author: Robert D. Edwards and John Magee
    year: 1948
    url: book
    type: primary
  - title: Technical Analysis of the Financial Markets
    author: John J. Murphy
    year: 1999
    url: book
    type: secondary
confidence: medium
---

## Purpose
Two parallel trend lines enclosing price: a base trend line and a parallel line at a chosen distance. It shows the trading range of a trend, with support at the lower line and resistance at the upper in an uptrend.

## How the author meant it to be used
Trend channels are old technique (Edwards and Magee, 1948, spoke of a return line parallel to the main trend line). The base line is drawn first through the swing points; the parallel passes through the opposite extreme (for an uptrend, the highest high between the points). A break out of the channel may signal acceleration or reversal. ChartSchool covers the trend line rules (two points, third confirms, spacing, steepness).

## How you draw it
Three clicks: points 1 and 2 set the base line; point 3 sets the offset of the parallel (its vertical distance from the base line at the time of point 3). Moving point 3 changes only the width. OpenCandle stores the width as a single price offset c at the midpoint and applies it as a screen offset, so on a log scale it is a constant log-price offset and the lines stay parallel; switching between linear and log changes the end widths while the midpoint stays fixed. Moving point 1 or 2 changes the slope and the parallel moves with it, keeping the width. The lines span from point 1 to point 2 in time, with optional extension in settings. Anchors are time and price.

## Geometry and levels
Base line L through (t1,p1),(t2,p2). Parallel U = L + d, with d = p3 - L(t3), a vertical offset. A middle line at L + d/2 is a common option. The offset should be exactly parallel in the displayed scale: on a log chart the lines are parallel in log space (equal log-price offsets), otherwise the channel visibly widens or narrows. Log scale: store the anchors as time and price and evaluate the line in the displayed scale, so it stays straight and passes through both anchors after a scale switch. ChartSchool notes that highs and lows line up better on semi-log for long-term lines or large moves.

## Standard defaults
Two outer lines with a fill and an optional middle line. Extension off by default in many implementations.

## Reading it
In an uptrend the lower line is support and the upper is resistance; touches of both validate the channel. A close outside the upper line is strength or a blow-off warning; outside the lower line is a failure warning. The lines are descriptive, not guaranteed levels.

## Common mistakes and edge cases
- Parallel in price versus in percent on a log chart.
- The third click may be on either side of the base line; both are valid.
- Width must not collapse when the base points are dragged.
- Interval change keeps the anchors; width is a price offset at the anchor time.

## How OpenCandle does it
- The width is stored as one price offset at the midpoint and applied as a screen offset, so on a log chart it stays parallel.
- Switching between linear and log scale changes the widths at the ends; the midpoint stays fixed.

## Open questions
- Whether the middle line is on by default.
- Book citations in the sources list are background reading and were not re-checked line by line.
