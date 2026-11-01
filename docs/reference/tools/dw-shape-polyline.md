---
id: dw-shape-polyline
name: Polyline
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
A closed or open multi-sided figure made from straight segments, outlining an irregular zone.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Click to add each vertex; finish with double-click, Enter, or by clicking the first vertex to close. Vertices are draggable; fill and border in settings. If closed it can be filled.

## Geometry and levels
List of vertices in time and price joined by straight segments (straight in the displayed scale); an optional closing segment from last to first, with fill. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It outlines a free-form zone; no signal.

## Common mistakes and edge cases
- Distinguish from Path: Polyline can be closed and filled, Path is an open route.
- Fewer than 2 vertices should not be saved.
- Self-intersecting figures need a fill rule (non-zero is usual).

## How OpenCandle does it
- Open and unfilled; it never closes. It is the same as Path except that Path adds an end arrowhead.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
- Whether OpenCandle closes the shape automatically.
