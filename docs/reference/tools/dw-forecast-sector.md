---
id: dw-forecast-sector
name: Sector
kind: drawing
family: forecasting and measurement
sources:
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
A pie-slice (circular sector) with a centre and two bounding rays, marking an angular region of the chart, for example a range of directions from a pivot.

## How the author meant it to be used
No author or standard trading method. It is a geometric annotation that OpenCandle files under forecasting.

## How you draw it
Three clicks in OpenCandle: the centre, the start of the arc, and the end of the arc. The distance from centre to start sets the radius and the angle from the start ray to the end ray sets the opening. Points are draggable. The shape has a single fill colour. The sweep goes the shorter way round, and the radius and angles are measured in pixels.

## Geometry and levels
Centre C, radius r = |S - C| in pixels, sector from angle(S - C) to angle(E - C). The geometry is in pixel space, so the shape changes when the chart is zoomed or resized even though the anchors are in time and price. In OpenCandle the arc sweeps the shorter way.

## Standard defaults
A single fill with a border; no labels.

## Reading it
Visual only. It frames an angular range from a point but is not an analytical tool.

## Common mistakes and edge cases
- Pixel-space shape distorts on zoom and price-scale changes.
- Sweep direction when the end is clockwise from the start.
- Zero radius is degenerate.

## How OpenCandle does it
- Click the centre, then the start, then the end. Radius and angles are in pixels, and the sweep goes the shorter way.

## Open questions
- The exact gesture and arc direction need observation.
- Low confidence: no source.
