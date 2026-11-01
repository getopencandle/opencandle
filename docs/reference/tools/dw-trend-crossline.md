---
id: dw-trend-crossline
name: Crossline
kind: drawing
family: trend lines
sources:
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: high
---

## Purpose
A horizontal and a vertical line crossing at one clicked point, marking a price and a time at once.

## How the author meant it to be used
A convenience annotation combining a horizontal line (level) and a vertical line (time). No single author.

## How you draw it
One click sets the crossing. Dragging moves both lines (horizontal follows price, vertical follows time). Hotkey in OpenCandle: Alt + C, at the cursor. Price and time labels appear on their axes.

## Geometry and levels
Horizontal line y = p1 at all times; vertical line x = t1 at all prices; both infinite. Scale type does not matter.

## Standard defaults
Two lines in one colour with price and time labels.

## Reading it
Marks an event's price at its time, or a reference point to compare later price against. No signal on its own.

## Common mistakes and edge cases
- It is one drawing, so clicking either line selects it.
- The price label follows the axis mode.
- Interval change keeps the time anchor.
- A future-dated crossing remains valid.

## Open questions
- Whether either line can be hidden in settings.
- No external source describes behaviour.
