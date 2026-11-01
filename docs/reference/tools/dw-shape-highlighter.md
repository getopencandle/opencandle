---
id: dw-shape-highlighter
name: Highlighter
kind: drawing
family: shape
sources:
  - title: Common charting convention for annotation and drawing tools
    author: none (no single author)
    year: n/a
    url: book
    type: secondary
confidence: medium
---

## Purpose
A wide, semi-transparent freehand stroke used to emphasise a region, like a marker pen.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Same gesture as Brush: press, drag, release; the tool stays armed until Esc or Cross. The stroke is wide and translucent so candles stay visible underneath. Move the whole stroke by dragging; colour and opacity are in settings.

## Geometry and levels
Samples in time/price as for Brush, drawn with a wide cap and opacity well below 1. Overlap within one stroke should not darken (draw as a single path); separate strokes may stack.

## Standard defaults
OpenCandle draws it 20 pixels wide at 20 percent opacity.

## Reading it
A shape carries no signal by itself; it marks an area, a path or an expectation, and any conclusion is your.

## Common mistakes and edge cases
- Full opacity hides the candles.
- Self-overlap within a stroke should not double the opacity.
- Width is in pixels, not price, so it does not scale with price zoom.

## How OpenCandle does it
- One continuous path with round caps, so overlaps do not darken. Default width 20 at 0.2 opacity.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
