---
id: dw-forecast-position-forecast
name: Position forecast
kind: drawing
family: forecasting and measurement
sources:
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
A forecast line from a source price to a target price that labels the expected change, the percent change and, when countable, the number of bars. A quick way to sketch and size a price projection.

## How the author meant it to be used
No author or method. It is a plain projection annotation: you state where price is and where they expect it to go, and the tool computes the move. It contains no forecasting model.

## How you draw it
Two clicks: point 1 is the source price, point 2 the target. A segment joins them, with a plate at the source showing its price and a plate at the target showing change and percent (and bars when countable). Both points are draggable and the plates follow. Anchors are time and price; the bar count is recomputed on interval change.

## Geometry and levels
Change = p2 - p1 (signed, in the instrument's tick decimals); percent = (p2 - p1)/p1 x 100 relative to the source; bars = bars between the times. The line is a plain segment, not extended.

## Standard defaults
No specification from an original source. Nothing is seeded in OpenCandle.

## Reading it
Visual target and sizing of risk or reward. Not a signal.

## Common mistakes and edge cases
- Percent base is the source price, so swapping the points changes it.
- A target below the source must show a negative sign.
- A target beyond the last bar needs the future axis to count bars; otherwise omit the bar count.
- Zero source price: no percent.
- Interval change keeps the price move and changes the bar count.

## How OpenCandle does it
- The source plate shows the price. The target plate shows the signed change, the percent of the source and the unsigned bars. It is a plain segment.
- A point anchored inside the newest bar snaps to that bar.

## Open questions
- The original tool's gesture and labels are unknown; observation is needed.
- Low confidence: no source exists.
