---
id: dw-channel-flat-top-bottom
name: Flat top/bottom
kind: drawing
family: channels
sources:
  - title: Technical Analysis of Stock Trends
    author: Robert D. Edwards and John Magee
    year: 1948
    url: book
    type: primary
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
A shape with one sloping trend line and one horizontal line, joined at the ends. It outlines a flat resistance or support against a rising or falling opposite line, as in ascending and descending triangles.

## How the author meant it to be used
No author for the tool. The shapes it traces are the classic ascending triangle (flat top, rising bottom) and descending triangle (flat bottom, falling top) described by Edwards and Magee (1948). The tool is a software convention: a trend line plus a horizontal line at a clicked price.

## How you draw it
Three clicks: points 1 and 2 define the sloping line, point 3 sets the price of the horizontal line over the same time span. The ends are joined by connectors so the shape is a band. All three points are draggable.

## Geometry and levels
Sloping line L through (t1,p1),(t2,p2). Flat line at y = p3 from t1 to t2. The band is filled between them. A flat line above L is a flat top (resistance), below is a flat bottom (support). The flat line is flat in either scale; the sloping line follows the scale rules.

## Standard defaults
Two lines and a fill; colour and opacity are your settings.

## Reading it
Price compresses between the lines. For a flat top a close above the flat line is the breakout; for a flat bottom, a close below. Volume expansion on breakout is the classic confirmation (the classic view of Edwards and Magee). Not a signal on its own.

## Common mistakes and edge cases
- Mixing up which line is flat, and which point sets it.
- The lines may cross inside the range (a bow-tie), which should render without error.
- Interval change keeps the anchors.

## How OpenCandle does it
- Three clicks: two for the slope, then the flat price (its time is ignored). There are no end connectors.
- The flat handle sits at the calendar-time midpoint.

## Open questions
- Exact click count and gesture need observation.
- No primary source for the tool itself; low confidence.
- Book citations in the sources list are background reading and were not re-checked line by line.
