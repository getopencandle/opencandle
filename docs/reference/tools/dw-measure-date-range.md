---
id: dw-measure-date-range
name: Date range
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
Measures the time between two points: number of bars and elapsed calendar time. Only the horizontal measure is shown; price is hidden.

## How the author meant it to be used
No author. Measuring tools read distances in price and time; they are annotations with no signal of their own.

## How you draw it
Two clicks: the start bar and the end bar. A horizontal bracket or band shows a label with bars and time. Both points are draggable and the body moves it. Only the click times are measured. It is built on the date-and-price range with the price measure hidden. The label shows bars and calendar duration, both unsigned.

## Geometry and levels
Bars = difference of bar indices (adjacent bars = 1); elapsed time = t2 - t1 in days, hours and minutes. Bars exclude axis gaps such as weekends, while elapsed time includes them, so the figures differ. Price scale type does not matter.

## Standard defaults
Label shows bars and elapsed time; fill colour is your setting.

## Reading it
Measures the length of a move or consolidation, or the gap between cycle points.

## Common mistakes and edge cases
- Say whether the figure is bars or calendar time.
- On interval change the bar count changes and elapsed time does not.
- A point beyond the last bar needs the axis extension to count bars.
- Click order: report a consistent sign.

## How OpenCandle does it
- Shows the number of bars and the duration. Bars are plotted bars; the duration is calendar time. Both are unsigned, so a right-to-left range has no sign.
- The box spans both click prices and its tint follows price direction.
- A point anchored inside the newest bar snaps to that bar.

## Open questions
- Which label fields are on by default.
