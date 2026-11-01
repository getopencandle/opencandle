---
id: dw-shape-arrow
name: Arrow
kind: drawing
family: arrow
sources:
  - title: Common charting convention for annotation and drawing tools
    author: none (no single author)
    year: n/a
    url: book
    type: secondary
confidence: medium
---

## Purpose
A line segment with an arrowhead on the end, pointing from one place on the chart to another.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Two clicks: point 1 is the tail (start), point 2 is the head. Hold Shift while placing the second point to lock the angle to 45 degree steps. Both points can be dragged afterwards; colour, width and arrowhead options are in settings.

## Geometry and levels
Segment from point 1 to point 2 in time and price; arrowhead at point 2 oriented along the segment, sized in pixels. It does not extend beyond its ends. Head orientation is computed in screen space so it looks right on log scale.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It indicates direction, a move, or a pointer to a bar. No signal.

## Common mistakes and edge cases
- Computing head orientation in price/time units distorts the head.
- Shift-snap should apply to the screen angle.
- Both points on the same bar and price make a degenerate arrow.

## How OpenCandle does it
- Hold Shift while placing the second point to lock to 45-degree steps. Shift while dragging a handle locks to an axis instead.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
