---
id: dw-shape-circle
name: Circle
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
A circle used to ring a bar, a cluster or a turning point.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Two clicks (or press-drag-release): the first is the centre, the second sets the radius (a point on the circumference). Both are draggable; dragging the circumference point resizes. Border and fill in settings.

## Geometry and levels
Centre in time/price plus a radius. Because time and price axes have different pixel scales, a true circle needs a radius in screen pixels with the centre in chart coordinates. If instead the radius is kept in chart units it becomes an ellipse on rescale. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It highlights an area; no signal.

## Common mistakes and edge cases
- A circle that turns into an oval after rescale surprises people; choose the behaviour explicitly.
- Zero radius should not be saved.

## How OpenCandle does it
- The radius is computed in screen pixels each frame, so it is always round.
- A shape drawn inside one bar of a higher interval collapses, and stops painting below a radius of 1 pixel.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
- Whether the radius is in pixels or in chart units.
