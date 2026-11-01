---
id: dw-shape-ellipse
name: Ellipse
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
An ellipse enclosing a swing or cluster of bars, or showing a rounded range.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Two clicks on opposite corners of the bounding box; the ellipse is axis aligned. Handles resize. Border and fill in settings.

## Geometry and levels
Centre and two semi-axes in time and price, axes aligned with time and price. Since it is in chart coordinates it stretches with zoom. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It marks an area; no signal.

## Common mistakes and edge cases
- Some tools use three clicks (span, then height); OpenCandle uses two corner clicks.
- Zero-size axes should be rejected.

## How OpenCandle does it
- Two clicks on opposite corners of an axis-aligned box. It stretches with zoom.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
