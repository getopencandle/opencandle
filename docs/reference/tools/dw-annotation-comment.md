---
id: dw-annotation-comment
name: Comment
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
A speech-bubble style annotation (rounded bubble with a small tail) for short remarks at a bar.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
The anchor click sets the point the bubble refers to, and the bubble is placed offset from it. Type the text. Drag to move; edit the text and style in settings.

## Geometry and levels
Anchor at time/price; the bubble sits above or beside it with a small tail toward the anchor. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Text colour and size follow the drawing style; a readable size with a contrasting colour is typical.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- It differs from Callout mainly in styling, so make sure the two are not identical in behaviour without reason.
- The tail must follow the anchor when you drag.

## How OpenCandle does it
- Same two-click geometry as Callout, with fully rounded corners and the default text "Comment". There is no inline editor at placement; double-click to edit.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
- How OpenCandle distinguishes Comment from Callout in interaction.
