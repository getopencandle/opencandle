---
id: dw-shape-arc
name: Arc
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
A curved segment marking rounding turns or bowl shapes.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Three clicks: the first two define the chord (the arc ends) and the third sets the bulge. Handles reshape. Border and fill in settings.

## Geometry and levels
Two end points (time, price) and a bulge point; the curve passes through all three, as a circular arc (screen space) or a quadratic curve. The definition is conventional, not standardised. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It marks a rounded turn such as a rounding bottom; no signal.

## Common mistakes and edge cases
- A circle through three points can be the major or minor arc; use the one through the third click.
- Colinear points degenerate to a line.

## How OpenCandle does it
- Drawn as a closed half ellipse, including the chord line. The third click only sets the height; the apex time is pinned to the middle of the chord.
- On a sloped chord the peak is the perpendicular projection, so the curve does not pass through the apex handle.
- Dashed and dotted line styles work.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
- Whether it is a true circular arc or a quadratic curve.
