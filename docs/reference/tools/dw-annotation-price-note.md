---
id: dw-annotation-price-note
name: Price note
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
A note tied to a price level, with a line from the anchor out to a label that displays the price.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
Two clicks: the first sets the price and time being referenced, the second places the label. The label shows only the price; there is no text field. Dragging the anchor updates the price; dragging the label body moves only the label.

## Geometry and levels
Anchor: time and price. Label: offset position. A thin line joins them. The price shown is the anchor price, formatted to the symbol's tick precision. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Text colour and size follow the drawing style; a readable size with a contrasting colour is typical.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- The displayed price must update if the anchor is dragged vertically.
- The price shown belongs to the anchor, not to the label end.

## How OpenCandle does it
- Two clicks: the target, then the box. The box shows only the price, with no free text.
- The price is read from the target anchor at every repaint, so it updates after drags. Dragging the body moves only the box.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
- Whether the label should also allow typed text.
