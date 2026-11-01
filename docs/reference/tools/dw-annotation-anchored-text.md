---
id: dw-annotation-anchored-text
name: Anchored text
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
Text fixed to a screen position (a corner or edge of the pane) rather than to a bar and price, so it stays visible as you pan and zoom.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
Click once to place; the item then keeps its position relative to the pane, not the data. Edit text, font, colour and background like ordinary text. Dragging changes the screen position.

## Geometry and levels
Anchor is in pixels or pane fractions, not time/price. It does not move with panning, zooming, scale change or interval change. OpenCandle stores the position as fractions of the pane, so a window resize keeps a proportional position rather than an offset from the nearest edge. It ignores pan, zoom, price scale mode, symbol and interval. The default anchor is wherever you click.

## Standard defaults
No numeric defaults.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Implementing it as ordinary time/price text defeats its purpose: it must not move on pan or zoom.
- It should not be affected by the price scale mode (log, percent) or interval change.

## How OpenCandle does it
- Stored as fractions of the pane, so resizing the window keeps a proportional position. It ignores pan, zoom, scale mode, symbol and interval.
- The default anchor is wherever you click.

## Open questions
- Whether it should be saved per symbol or globally.
