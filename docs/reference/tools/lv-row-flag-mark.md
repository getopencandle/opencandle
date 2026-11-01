---
id: lv-row-flag-mark
name: Flag mark
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
A small flag icon placed at a bar and price to mark a point of interest, optionally with text.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
One click places the flag; the flag glyph is centred on the click point. Drag to move; change colour in settings.

## Geometry and levels
Single anchor at time/price; the flag glyph is a constant pixel size and is centred on the anchor. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
A small flag in a single accent colour.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Glyph orientation should not flip with scale mode.
- The click point is the centre of the flag glyph, not the pole base.

## How OpenCandle does it
- The flag glyph is centred on the click point and has a constant 22 pixel size.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
