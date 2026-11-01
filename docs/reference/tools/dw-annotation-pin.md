---
id: dw-annotation-pin
name: Pin
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
A pin marker with an attached note, placed at a bar to flag a moment; hovering or clicking shows the note.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
One click places the pin at the clicked time and price. Double-click the pin to write its note. Drag to move; edit the text and style in settings. The pin icon stays small and screen-sized.

## Geometry and levels
Single anchor at time and price; the pin glyph points at the anchor. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale. The text plate is always shown, not only on hover; the marker and plate keep a constant pixel size.

## Standard defaults
No numeric defaults. Text colour and size follow the drawing style; a readable size with a contrasting colour is typical.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Some tools hide the note text until hover or click; OpenCandle always shows it, so a pin behaves much like a Note with a marker.
- Pin icon should stay a constant pixel size at every zoom.

## How OpenCandle does it
- Click to place, double-click to write the note.
- The text plate is always shown, not only on hover. The marker and plate have a constant pixel size.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
