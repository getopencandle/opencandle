---
id: dw-shape-arrow-down
name: Arrow mark down
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
A fixed-shape downward arrow stamp placed at a bar to mark a bearish event such as a sell or exit.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
One click places the arrow with its tip at the clicked time and price. Drag to move; size and colour in settings. One anchor, no second handle.

## Geometry and levels
Single anchor at time/price at the arrow tip; constant-size glyph pointing down. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
A red medium glyph is conventional.

## Reading it
It marks a bearish event; no signal by itself.

## Common mistakes and edge cases
- Mirror of Arrow mark up: use the same anchor rule (tip).
- Red is conventional but colour should be user-settable.

## How OpenCandle does it
- The tip sits at the anchor; the glyph is 22 pixels.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
