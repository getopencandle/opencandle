---
id: dw-trend-horizontal-ray
name: Horizontal ray
kind: drawing
family: trend lines
sources:
  - title: Support & Resistance (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/support-and-resistance
    type: secondary
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: high
---

## Purpose
A horizontal line that starts at a chosen bar and extends to the right only. It marks a level from the moment it became relevant, such as a prior high not yet retested.

## How the author meant it to be used
The same idea as a support or resistance level (ChartSchool), with an explicit starting bar so the level shows only from when it was established. No single author.

## How you draw it
One click sets both the starting bar and the price. The line runs right from that bar to the chart edge. The anchor can be dragged in time and price. Hotkey in OpenCandle: Alt + J, at the cursor. Time and price are stored, so interval change keeps the start at the same moment.

## Geometry and levels
y = p for t >= t1 and nothing for t < t1. Horizontal on a log scale. It extends over future bars including skipped time.

## Standard defaults
Single line starting at the anchor, with a price label on the axis.

## Reading it
A level projected from its origin, so you can see how many later tests it drew. Break and retest conventions are as for a horizontal line.

## Common mistakes and edge cases
- It must not extend left of the anchor.
- An anchor beyond the last bar is allowed and must still reach the edge.
- On interval change the start is the bar containing the anchor time.
- Price label rules as for the horizontal line.

## Open questions
- Whether a left-extending option exists in OpenCandle.
- The sources do not describe this tool specifically.
