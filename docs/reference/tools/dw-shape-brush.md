---
id: dw-shape-brush
name: Brush
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
Freehand drawing: a line that follows the mouse path, for sketching expected price paths or circling areas.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Press at the start, move, release to end the stroke. Each stroke is one object. In OpenCandle the tool stays armed for another stroke until Esc or choosing Cross. Afterwards the whole stroke can be moved; individual points are usually not editable; colour and width are in settings.

## Geometry and levels
The stroke is a list of time/price samples captured as you move (screen points converted to chart coordinates), drawn as a smoothed polyline. Anchors are time/price, so it follows panning and zooming and stretches with the chart. Samples should be thinned to avoid huge objects.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
A shape carries no signal by itself; it marks an area, a path or an expectation, and any conclusion is your.

## Common mistakes and edge cases
- Storing only pixels (not time/price) makes the stroke slide off the chart on pan.
- Very long strokes need point thinning.
- A click without movement should not create an invisible object.

## How OpenCandle does it
- No smoothing: straight samples about 4 pixels apart. When the 512-point cap is reached, points are thinned by half.
- Dashed and dotted line styles work.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
