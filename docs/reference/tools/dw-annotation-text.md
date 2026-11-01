---
id: dw-annotation-text
name: Text
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
Free text label placed at a chart location.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
One click places the label at that time and price, then you type the text. The click is the anchor. Afterwards you can drag to move it, edit the text, and change font, size, colour, bold, italic and background or border in settings.

## Geometry and levels
The anchor is a single time/price point; the text box extends right and down (or is centred) from it depending on alignment. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Text colour and size follow the drawing style; a readable size with a contrasting colour is typical.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Empty text: an item with no text should be discarded rather than leave an invisible object.
- Text anchored to bars scrolls off screen with them; that is expected here (a screen-fixed text is the separate Anchored text tool).
- Long text should wrap or stay on one line consistently; do not clip silently.

## How OpenCandle does it
- Anchored in time and price, so it scrolls with the bars. Empty text is deleted when you close the editor.
- Plain text has no background, border or wrapping; Anchored text has them.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
