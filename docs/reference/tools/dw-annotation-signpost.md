---
id: dw-annotation-signpost
name: Signpost
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
A vertical post with a text sign, placed at a bar to flag an event such as news or a decision.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
Two clicks: the base of the pole, then the sign. Edit the text (default "Signpost") and style in settings. Drag to move.

## Geometry and levels
Anchor at time (and a price for height). The post is a short vertical line with a sign box on top. Anchors are stored in time and price, so the object stays on the same bar and level when you pan, zoom or change the scale. On an interval change the time anchor maps to the bar containing that timestamp (it may land on a different bar index). On log scale, lines between anchors should be straight in the displayed scale.

## Standard defaults
No numeric defaults. Text colour and size follow the drawing style; a readable size with a contrasting colour is typical.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- The pole length is set by your two clicks in chart units, so it changes with zoom rather than staying a fixed pixel height.
- Signposts at nearly identical times overlap; they are not spread automatically.

## How OpenCandle does it
- Two clicks: the pole base, then the sign. The pole length is in chart units, so it changes with zoom. Default text "Signpost". Double-click to edit.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
- No source defines Signpost precisely; this is inferred from the name and common use.
