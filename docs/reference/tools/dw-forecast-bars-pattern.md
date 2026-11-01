---
id: dw-forecast-bars-pattern
name: Bars pattern
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
Copies a selected run of bars so the copy can be placed elsewhere on the chart, either to compare an old price sequence with the current one or to project a past pattern forward as a forecast.

## How the author meant it to be used
No author. It automates analogue forecasting: comparing today's action with similar past sequences and projecting the outcome. The tool only reproduces a bar range at a chosen place.

## How you draw it
Two clicks select the source range (first and last bar). The copy is stored with the drawing, not re-read from the series later, and is then placed by moving the drawing's anchor so the whole pattern moves together. The copy can be shown in modes from high-low bars up to candles or a line, and can be mirrored (reversed in time) or flipped (inverted in price).

## Geometry and levels
Source bars b_0..b_n (open, high, low, close). The copy keeps its shape relative to the first bar: prices are offset so the first bar's reference maps to the anchor price, with heights kept as absolute price offsets from the first anchor, not scaled by percent. Time spacing follows the destination bar spacing. Flipped inverts prices about the anchor price; mirrored reverses the order in time.

## Standard defaults
Mode high-low bars, not mirrored, not flipped, colour #2962FF.

## Reading it
A rough analogue: if the past sequence led to a drop, the copy suggests it might repeat. Historical matching has no guaranteed predictive value.

## Common mistakes and edge cases
- Absolute versus relative scaling: copying absolute prices projects an old price level onto a different level.
- The stored copy does not update if the source series is revised.
- Interval change changes bar spacing; the copy must follow the new widths.
- Mirror and flip are distinct operations.

## How OpenCandle does it
- The copy is stored with the drawing. Prices are an absolute offset from anchor 1, not scaled by percent.
- Flip mirrors about anchor 1's price; mirror reverses time order. Modes are high-low, open-close and line variants; the default is high-low.

## Open questions
- Whether prices are offset or scaled by percent.
- Low confidence: no source for a standard algorithm.
