---
id: dw-shape-rectangle
name: Rectangle
kind: drawing
family: shape
sources:
  - title: Common charting convention for annotation and drawing tools
    author: none (no single author)
    year: n/a
    url: book
    type: secondary
confidence: high
---

## Purpose
A box with sides parallel to the time and price axes, marking a range, consolidation, supply or demand zone, or time window.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Two clicks (or press-drag-release) on opposite corners. OpenCandle hotkey: Alt + Shift + R. Afterwards drag the whole box, drag a side or corner handle to resize, and set border, fill, opacity and optional right extension in settings.

## Geometry and levels
Defined by two corners (time1, price1) and (time2, price2); the box covers the min and max of each. Edges are axis-aligned in the displayed scale; on a log chart horizontal edges stay horizontal and the box still spans the two prices. Optional text label. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It marks a zone; whether price respects it is the reader's judgement.

## Common mistakes and edge cases
- Corners dragged past each other must flip cleanly, not produce a negative-size box.
- Zero width or height gives a line; keep it selectable.
- Right extension (if offered) goes to the future time axis, not by bar count.

## How OpenCandle does it
- Corners are normalised, and it can be extended.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
