---
id: gannbox
name: Gann box
kind: drawing
family: Gann
sources:
  - title: The Tunnel Thru the Air
    author: W. D. Gann
    year: 1927
    url: book
    type: primary
  - title: How to Make Profits in Commodities
    author: W. D. Gann
    year: 1942
    url: book
    type: primary
  - title: Gann Method and Gann Box (concept pages)
    author: charting software vendors
    year: 2024
    url: book
    type: secondary
confidence: low
---

## Purpose
A rectangle spanning a chosen price range and time span, subdivided in both directions with diagonals, used to look for balance between price and time ("squaring") and for support and resistance at the subdivisions.

## How the author meant it to be used
Gann held that price and time are proportional, and that when elapsed time matches a price move in his chosen units the market is "squared" and a turn is likely. He divided ranges into eighths (and thirds) and watched the 50% points most closely. The box is a modern drawing tool built on that idea rather than a figure Gann himself named, so the exact construction is from secondary software descriptions. Secondary sources note that these methods fit history easily and have no rigorous evidence of predictive power.

## How you draw it
Two clicks, opposite corners: start at a significant pivot (low or high) and end at the other pivot or a chosen projection. The box covers the price range between the two prices and the time span between the two bars; both corners are draggable and the rectangle resizes. Diagonals run corner to corner (and from the midpoints), and the 1x1 diagonal is the line where fraction of price equals fraction of time. The box is anchored in time and price, so across interval changes it stays on its dates and prices; the time axis divisions are in elapsed time (bars shown), so on a different interval the number of bars inside changes while the proportions stay. On a log scale, price subdivisions should be taken in the displayed scale or they will not line up with diagonals.

## Geometry and levels
Traditional: 0, 1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8, 1 of both price and time, with 1/2, 1/4 and 3/4 most important. Many implementations substitute Fibonacci fractions (0.382, 0.5, 0.618) as an option. Diagonals connect the corners; where the diagonals cross the grid lines are the "squaring" points. These come from secondary sources.

## Standard defaults
Eighths grid with fans or diagonals; Fibonacci divisions as alternative.

## Reading it
Watch price near the 50% line and where diagonals cross grid lines in time and price at once. Treat as a framework, not a signal generator.

## Common mistakes and edge cases
- Believing the box is square on screen; it is square only in data units chosen by you.
- Weekends and holidays: time divisions count bars or calendar days depending on implementation; the choice changes results.
- Inverted drawings (end before start) should still produce a symmetric box.
- Log scale distorts the diagonals.

## How OpenCandle does it
- Divisions are 0, 0.25, 0.382, 0.5, 0.618, 0.75 and 1: quarters mixed with Fibonacci ratios, no eighths.
- Time divisions are counted in bars. Price divisions are in plain price, so on a log chart they do not meet the diagonals at the squaring points.
- Only the two corner diagonals are drawn.

## Open questions
- Whether OpenCandle's time axis uses bars or calendar time, and whether it offers Fibonacci vs eighth divisions.
-
- Book citations in the sources list are background reading and were not re-checked line by line.
