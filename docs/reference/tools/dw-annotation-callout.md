---
id: dw-annotation-callout
name: Callout
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
A text box with a pointer (tail) aimed at a specific bar and price, so the comment visibly refers to that spot.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
Two clicks: the first sets the target point the tail points to; the second places the text box. Type the text. Both points are draggable independently.

## Geometry and levels
Point 1 is the pointed-at time/price. Point 2 is the box anchor. The tail runs from the box edge to point 1. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Text colour and size follow the drawing style; a readable size with a contrasting colour is typical.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- The tail should leave from the box edge nearest the target, and update as the box is dragged.
- Target and box coinciding gives a degenerate tail; hide it or keep a minimum length.

## How OpenCandle does it
- The tail comes from the facing edge and is hidden when the target is inside the box.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
