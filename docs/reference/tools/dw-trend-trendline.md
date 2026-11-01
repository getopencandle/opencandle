---
id: dw-trend-trendline
name: Trendline
kind: drawing
family: trend lines
sources:
  - title: Trend Lines (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/trend-lines
    type: secondary
  - title: Support & Resistance (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/support-and-resistance
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
A straight segment through two price points that marks the slope of a trend: an uptrend line connects rising lows and acts as support, a downtrend line connects falling highs and acts as resistance.

## How the author meant it to be used
Trend lines are classic chartist technique (Edwards and Magee, 1948). ChartSchool: an uptrend line has a positive slope through two or more lows, the second higher than the first; a downtrend line has a negative slope through highs. Its rule: it takes two points to draw a trend line, and the third one confirms validity. More touches add validity; points should be reasonably evenly spaced, neither too close nor too far apart; a very steep line is unlikely to hold. A break of an uptrend line signals weakened net demand and a possible trend change, not a completed one.

## How you draw it
Two clicks: point 1 then point 2 (either may be earlier in time). The line is a finite segment between the two points; it does not extend (Ray and Extended line do that). Both endpoints are draggable and the body moves the whole segment. While drawing, an angle snap (Shift, 45 degree steps) constrains the second point. Anchors are stored as time and price, so the segment keeps its place on interval change (time maps to the bar containing it on the new interval).

## Geometry and levels
Segment from A=(t1,p1) to B=(t2,p2). Value at any time between the ends is linear interpolation in the displayed scale; slope is (p2-p1)/(t2-t1). No levels beyond the line. Log scale: store the anchors as time and price and evaluate the line in the displayed scale, so it stays straight and passes through both anchors after a scale switch. ChartSchool notes that highs and lows line up better on semi-log for long-term lines or large moves.

## Standard defaults
Plain line, no arrowheads, no extension, no label. Colour and width are your settings. Practice is to draw through reaction lows (uptrend) or highs (downtrend); wick versus close is your choice.

## Reading it
Price staying above an uptrend line (below a downtrend line) means the trend is intact. A decisive break with follow-through is the signal, and the line often flips role afterwards (support becomes resistance). The segment ends at point 2, so any reading beyond it needs an extended copy.

## Common mistakes and edge cases
- Expecting it to extend past point 2: that is a Ray or Extended line.
- Forcing points that do not line up; ChartSchool says it is best not to force the issue.
- Points too close together give a meaningless slope.
- Both clicks at the same time must be rejected or handled as vertical, not divide by zero.
- Log versus linear: see Geometry.
- Axis gaps: the line is straight on the plotted axis, not in calendar time.

## Open questions
- Whether slope is per bar or per calendar time.
- Whether magnet snapping to OHLC is offered.
- Book citations in the sources list are background reading and were not re-checked line by line.
