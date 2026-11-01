---
id: dw-forecast-ghost-feed
name: Ghost feed
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
A hand-drawn future price path displayed as synthetic ('ghost') bars, so a trader can sketch a scenario and see it rendered like real candles.

## How the author meant it to be used
No author or published method. It is a scenario-sketching annotation: you plot a path and the tool draws candle-like bars along it. The bars are invented and predict nothing.

## How you draw it
One click per point of the path, with a variable number of points. In OpenCandle you finish with a double-click or Enter. Each point can be dragged afterwards. Ghost candles are placed along the path, one per bar where bars can be counted, otherwise one every few pixels. Anchors are time and price.

## Geometry and levels
Each ghost candle opens at the previous close and closes at the path price for that bar; wicks extend a little past the body. Rising candles are hollow and falling are filled, in the line colour at partial opacity; this look is OpenCandle's own choice. Nothing is random, so a saved path always paints the same candles. A path in future time needs the axis to extend past the last bar.

## Standard defaults
None recorded.

## Reading it
A scenario illustration only. The shape is entirely your.

## Common mistakes and edge cases
- Interval change: the path is stored in time and price, and the candle count changes with the interval.
- Random wicks would change a saved sketch between sessions; they must be deterministic.
- Points in the past and in the future are both allowed.
- Finishing with fewer than 2 points gives no path.

## How OpenCandle does it
- Finish with a double-click or Enter.
- Candles are deterministic: each opens at the previous close and closes on the path. One candle per bar where bars can be counted, otherwise one every 8 pixels.

## Open questions
- The original tool's look and finish gesture are unknown.
- Low confidence: no source.
