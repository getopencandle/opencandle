---
id: dw-fib-fib-channel
name: Fib channel
kind: drawing
family: Fibonacci
sources:
  - title: Fibonacci Retracements (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-retracements
    type: secondary
  - title: Parallel channel and Fibonacci level practice
    author: common charting convention
    year: 2024
    url: book
    type: secondary
confidence: low
---

## Purpose
A trend channel whose parallel lines are spaced at Fibonacci ratios of the channel width, so you can read support and resistance bands inside and beyond the channel. It is the channel form of the Fibonacci retracement idea.

## How the author meant it to be used
There is no single author. The ratios come from the Fibonacci sequence (0.236, 0.382, 0.618 and relatives) and the tool is a software construction that combines a parallel channel with retracement-style levels. ChartSchool describes the retracement tool as marking support and resistance after a move, with 38.2 to 61.8 percent the main zone.

## How you draw it
Three clicks. Points 1 and 2 define the base trend line (left to right). Point 3 sets the opposite edge: its price offset from the base line sets the full channel width, which is the 1.0 level. All three points stay draggable: moving point 3 changes only the width, moving points 1 or 2 changes slope and position. Levels are lines parallel to the base line, drawn between point 1 and point 2 unless you turn on extend left or extend right, in which case they run on to the chart edge. The shape is anchored in time and price, so it stays on its bars when the interval changes. On a log scale the parallels should be built in the displayed scale or they will not look parallel.

## Geometry and levels
Let the base line run P1 to P2 and let d = P3 - P1 (the price offset at P1's time, in the chosen scale). Level r is the base line shifted by r times d. Ratio 0 is the base line and ratio 1 passes through point 3. OpenCandle's default ratios are 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618. Ratios above 1 lie beyond the third point. Bands between neighbouring levels may be filled.

## Standard defaults
The ratio list above, background fill on, ratio labels shown. This is an OpenCandle choice; there is no authority for a canonical list.

## Reading it
Treat each line as a possible support or resistance level in a trending market, with the 0.382 to 0.618 lines the most watched. A close outside the outer lines is read as acceleration or a break.

## Common mistakes and edge cases
- Placing point 3 on the trend side of the base line gives a negative width and flips the bands.
- Point 3 at the same price as the base line at its time gives zero width, and all lines coincide.
- A channel built in linear price will not look straight on a log chart.
- Extending left or right changes only visible length, never the ratios.

## How OpenCandle does it
- Levels are the base line moved by ratio x (P3 - P1) as a pixel vector, so the lines stay parallel on a log chart. The 1 line starts at P3's bar, not P1's.
- Default levels: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618 and 2.618. Bands, extend left and right, and ratio labels are available.

## Open questions
- Whether the offset is measured vertically at P1's time or perpendicular to the base line (vertical is the usual convention).
- Whether other tools use the same default ratio set.
- Only the ChartSchool retracement page covers the underlying ratios. No primary source for the channel was found; construction details are common practice or taken from OpenCandle's own code comments, unverified.
