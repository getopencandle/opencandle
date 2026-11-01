---
id: dw-annotation-price-label
name: Price label
kind: drawing
family: annotation
sources:
  - title: Common charting convention for annotation and drawing tools
    author: none (no single author)
    year: n/a
    url: book
    type: secondary
confidence: medium
---

## Purpose
A label attached to a price and bar that displays the price value at that point, often shaped like an arrow tag.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
One click places it at the clicked time and price. The label text is the price at the anchor (formatted to the symbol's precision). Dragging vertically changes the price shown.

## Geometry and levels
Anchor: time and price. The tag points at the anchor from the right or left. The text is derived from the anchor price. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Text colour and size follow the drawing style; a readable size with a contrasting colour is typical.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- The shown price must come from the anchor, not from a stale pixel position; recompute after scale changes.
- Rounding must follow the symbol tick size.

## How OpenCandle does it
- The price is recomputed from the anchor at every repaint, using the instrument's decimals, so drags and rescales are handled.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
- Whether the label is editable or fixed to the price.
