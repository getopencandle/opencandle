---
id: dw-shape-curve
name: Curve
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
A smooth curve with one control point, sketching a bending path or rounded trend.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Three clicks: the two ends, then a control point that pulls the curve toward it (a quadratic Bezier). Dragging the control point reshapes the curve; the end points move the ends.

## Geometry and levels
Quadratic Bezier B(t) = (1-t)^2*P0 + 2(1-t)t*C + t^2*P2. The curve passes through P0 and P2 but only bends toward C. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It sketches an expected shape; no signal.

## Common mistakes and edge cases
- The control point is not on the curve, which surprises people who expect it to be.
- Sample densely enough for smooth rendering at high zoom.

## How OpenCandle does it
- Three clicks: the two ends, then the control point (off the curve). Dashed and dotted line styles work.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
