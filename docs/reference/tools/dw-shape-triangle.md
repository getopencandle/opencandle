---
id: dw-shape-triangle
name: Triangle
kind: drawing
family: shape
sources:
  - title: Common charting convention for annotation and drawing tools
    author: none (no single author)
    year: n/a
    url: book
    type: secondary
confidence: medium
---

## Purpose
A three-vertex figure for outlining a triangular formation or three-point region.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Three clicks, one per vertex, in any order. All three are draggable; fill and border in settings.

## Geometry and levels
Three vertices (time, price) joined by straight segments and closed; filled if a fill is set. Straight in the displayed scale. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It outlines a region; it does not detect any chart pattern.

## Common mistakes and edge cases
- Colinear points give a degenerate triangle; keep it selectable.
- This is a plain drawing, not a triangle chart-pattern detector.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
