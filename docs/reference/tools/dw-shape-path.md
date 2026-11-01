---
id: dw-shape-path
name: Path
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
A multi-segment line drawn by clicking successive points, used to sketch an expected price path.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Click to add each vertex; double-click or Enter/Esc finishes. The result is an open line through the points, often with an arrowhead on the end. Vertices can be dragged afterwards; colour and width in settings.

## Geometry and levels
List of vertices in time and price joined by straight segments (straight in the displayed scale). Not closed, not filled. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It shows a projected route; no signal.

## Common mistakes and edge cases
- A path with one vertex should not be saved.
- The finish gesture must not add a duplicate final vertex.
- Times may go backward; do not force left-to-right order.

## How OpenCandle does it
- The same as Polyline, plus an arrowhead at the end. No fill.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
- Whether Path ends with an arrowhead by default.
