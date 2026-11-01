---
id: dw-annotation-emoji
name: Emojis
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
An emoji stamp placed on the chart to mark a bar with a sentiment or event.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
Pick an emoji from a picker, then click to place it. Drag to move; size is a setting. OpenCandle includes an emoji picker.

## Geometry and levels
Single anchor at time/price, glyph centred on it, size in pixels. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
A medium glyph size is typical.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Emoji rendering differs by font and operating system; saved layouts may look different on another machine.

## How OpenCandle does it
- Picked from an emoji picker. Constant pixel size, centred on the anchor.

## Open questions
- Whether more emoji sets should be offered.
