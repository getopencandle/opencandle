---
id: dw-shape-double-curve
name: Double curve
kind: drawing
family: shape
sources:
  - title: Common charting convention for annotation and drawing tools
    author: none (no single author)
    year: n/a
    url: book
    type: secondary
confidence: low
---

## Purpose
An S-shaped curve with two control points, sketching an inflection or wave.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Four clicks: the two ends, then the two control points; dragging a control point reshapes its half of the curve.

## Geometry and levels
Cubic Bezier B(t) = (1-t)^3*P0 + 3(1-t)^2*t*C1 + 3(1-t)*t^2*C2 + t^3*P3. It passes through P0 and P3 only. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It sketches an expected wave shape; no signal.

## Common mistakes and edge cases
- Control points are not on the curve.

## How OpenCandle does it
- Four clicks: the two ends, then two control points. Dashed and dotted line styles work.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
