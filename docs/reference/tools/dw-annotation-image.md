---
id: dw-annotation-image
name: Image
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
A user-supplied picture placed on the chart, such as a screenshot or logo.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
Choose an image file, then click to place it. Drag to move; set Width, Height and opacity in settings (the aspect ratio is not locked and there are no corner drags). OpenCandle takes local image files only (up to 2 MB, never fetched from a web address).

## Geometry and levels
The picture is centred on an anchor at time and price. Its size is in pixels, so it does not scale with zoom. Images must be stored with the layout, which raises size and privacy concerns.

## Standard defaults
No numeric defaults.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Embedded image data bloats saved layouts; consider size limits.
- Do not fetch images from remote addresses automatically.

## How OpenCandle does it
- Centre anchor in time and price with a pixel size, so it does not scale with zoom. Width and height are set in settings and the aspect ratio is not locked.
- Local files only, up to 2 MB.

## Open questions
- Whether to offer corner drags that keep the aspect ratio.
