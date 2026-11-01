---
id: dw-annotation-stickers
name: Stickers
kind: drawing
family: annotation
sources:
  - title: Common charting convention for annotation and drawing tools
    author: none (no single author)
    year: n/a
    url: book
    type: secondary
confidence: low
---

## Purpose
Large decorative image stamps placed on the chart.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
Pick a sticker from a gallery, click to place, drag to move, and change its Size in settings. OpenCandle draws its own sticker art.

## Geometry and levels
One centre point at time and price; the size is a fixed number of pixels set by the Size setting, so a sticker looks the same at every zoom and interval. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
None.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Art must be original; do not ship third-party sticker sets.

## How OpenCandle does it
- One centre point and a fixed pixel size (the Size setting).
- A sticker stays the same size when you zoom or change interval.
- Art is OpenCandle's own.

## Open questions
- How the sticker size should behave across interval changes.
