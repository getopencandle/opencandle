---
id: dw-annotation-note
name: Note
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
A short text box with a border and background, tied to a price and time, for chart commentary.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
Click to place, then type the note. Drag to move; edit the text and style in settings. It is a boxed variant of Text, often with a small marker at the anchor.

## Geometry and levels
Single anchor at time/price; the box sits offset from the anchor. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Text colour and size follow the drawing style; a readable size with a contrasting colour is typical.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Notes often have a maximum width with wrapping; do not let the box grow off the pane.
- The box should stay readable at all zooms (screen-sized, not scaled with the chart).

## How OpenCandle does it
- The plate's top-left corner sits at the anchor. Double-click to edit; empty text shows the placeholder "Note".

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
