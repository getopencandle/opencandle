---
id: dw-annotation-icons
name: Icons
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
A symbol stamp (star, arrow, flag, check and similar) placed at a bar and price.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
One click places the chosen symbol at the click; choose the symbol, size, colour and rotation in its settings afterwards. Drag to move. The anchor is the glyph centre.

## Geometry and levels
Single anchor at time/price; glyph centred; constant pixel size. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
A medium star in an accent colour is typical.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Changing the symbol in settings must not move the anchor.
- The glyph centre, not its top-left, is the anchor.

## How OpenCandle does it
- Constant pixel size, centred on the anchor. No rotation setting.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
