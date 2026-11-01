---
id: dw-measure-price-range
name: Price range
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
Measures the price difference between two points: absolute change, percent change and often ticks or points. Only the vertical measure is shown; time is hidden.

## How the author meant it to be used
No author. Measuring tools read distances in price and time; they are annotations with no signal of their own. Percent is relative to the starting price.

## How you draw it
Two clicks: point 1 is the start price and point 2 the end. A vertical bracket or band shows the change with a label. Both points are draggable and the body moves it. The click times only place the shape, not the measurement. It is built on the date-and-price range with the time measure hidden. The change is signed, shown in tick decimals and as a percent of point 1; the box spans both click times.

## Geometry and levels
Change = p2 - p1; percent = (p2 - p1)/p1 x 100; ticks = change / tick size. Percent is relative to point 1, so reversing the clicks gives a different percent. Log scale changes only how tall the band looks, not the numbers.

## Standard defaults
Signed change with percent in the instrument's tick decimals; fill colour is your setting.

## Reading it
Sizes a swing, stop distance, target or pullback.

## Common mistakes and edge cases
- Percent base is the first click.
- Up is positive.
- The label uses the instrument's price decimals.
- Zero start price.
- Percent or indexed axis modes change axis labels, not stored prices.

## How OpenCandle does it
- Shows the signed change in price (in the instrument's decimals) and the percent of point 1. No tick count.
- The box spans both click times.

## Open questions
- Which label fields are on by default.
