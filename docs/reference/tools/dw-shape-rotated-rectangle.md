---
id: dw-shape-rotated-rectangle
name: Rotated rectangle
kind: drawing
family: shape
sources:
  - title: Common charting convention for annotation and drawing tools
    author: none (no single author)
    year: n/a
    url: book
    type: secondary
confidence: low
---

## Purpose
A rectangle that can be tilted, so its long sides follow a sloped trend or channel.

## How the author meant it to be used
No single author; a basic geometric shape provided by most charting platforms for marking regions and paths. It is not an analytical method with rules, so there is no original text to cite. The description reflects common practice.

## How you draw it
Three clicks: points 1 and 2 define one side (and so the angle), and point 3 sets the width perpendicular to that side. All three are draggable. Fill and border in settings.

## Geometry and levels
Side from P1 to P2 in time and price; the opposite side is parallel and passes through P3. Whether the offset is perpendicular in screen space or vertical in price is not defined by any source; screen-space perpendicular keeps it a true rectangle.

## Standard defaults
No numeric defaults. Line colour and width, and an optional semi-transparent fill, follow the drawing style.

## Reading it
It marks a sloped channel; no signal.

## Common mistakes and edge cases
- Perpendicular offset must be measured in screen space or the shape skews on zoom.
- Click order matters: the third click only sets width.

## How OpenCandle does it
- The opposite side is offset perpendicular in screen space, so it stays a true rectangle.

## Open questions
- Behaviour on interval change and log scale is not confirmed against OpenCandle.
- Exact default colours and sizes are unspecified by any source.
- Whether width is a perpendicular (screen) or vertical (price) offset.
