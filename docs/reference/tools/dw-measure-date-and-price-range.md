---
id: dw-measure-date-and-price-range
name: Date and price range
kind: drawing
family: measurement
sources:
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: medium
---

## Purpose
Measures both the price difference and the time between two points: change, percent, bars and elapsed time, drawn as a box between the points.

## How the author meant it to be used
No author. Measuring tools read distances in price and time; they are annotations with no signal of their own.

## How you draw it
Two clicks: one corner and the opposite corner of the box. The box shows price change and time span in a label that updates as points move. Both corners are draggable and the body moves it. Anchors are time and price; the bar count is recomputed on interval change while price change and percent stay.

## Geometry and levels
Change = p2 - p1 (signed); percent = (p2 - p1)/p1 x 100 relative to point 1; bars = bar index difference; elapsed time = t2 - t1. Corners are (t1,p1) and (t2,p2). On a log scale the edges stay at the given prices and the percent is unchanged. Speed (change per bar) can be derived.

## Standard defaults
A filled box with a label of change, percent, bars and time; colour is your setting. Many implementations colour by direction.

## Reading it
Sizes swings and shows how long they took. Comparing two boxes is a way to judge relative strength and time symmetry.

## Common mistakes and edge cases
- Percent base is the first corner.
- Bar count counts plotted bars, not calendar days.
- Reversed corner order must still read sensibly, with a consistent sign convention.
- Interval change recomputes bars.

## How OpenCandle does it
- Uses the same price and time rules as the Price range and Date range tools. A zero starting price shows +0.00%.
- A point anchored inside the newest bar snaps to that bar.

## Open questions
- Which label fields are on by default.
- No primary source; content is convention.
