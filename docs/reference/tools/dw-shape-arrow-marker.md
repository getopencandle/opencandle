---
id: dw-shape-arrow-marker
name: Arrow marker
kind: drawing
family: arrow
sources:
  - title: Common charting convention for annotation and drawing tools
    author: none (no single author)
    year: n/a
    url: book
    type: secondary
confidence: low
---

## Purpose
A thick arrow-shaped marker drawn between two points to point at a spot or show a move.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Two clicks: the first is the tail, the second is the head. Both points are draggable. OpenCandle draws a filled block arrow; the head and shaft shrink when the arrow is shorter than about 30 pixels, and Shift locks to an axis from the first point rather than the 45 degree steps of the Arrow tool.

## Geometry and levels
Tail at point 1, head at point 2, in time and price. The arrow is a filled shaft with a triangular head whose size scales with the line width.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It indicates direction or a target; not a forecast.

## Common mistakes and edge cases
- A zero-length marker is kept as a degenerate line.
- Head size must be in pixels so it stays visible on short arrows.
- It differs from the thin Arrow tool mostly in styling (a filled thick body).

## How OpenCandle does it
- Two clicks: tail, then tip. A filled block arrow whose head and shaft shrink below 30 pixels of length.
- Shift gives an axis lock to the first point, not 45-degree steps.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
- Exact appearance versus Arrow is unspecified.
