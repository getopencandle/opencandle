---
id: dw-gann-gann-square-fixed
name: Gann square fixed
kind: drawing
family: Gann
sources:
  - title: How to Make Profits in Commodities
    author: W. D. Gann
    year: 1942
    url: book
    type: primary
  - title: Gann Square and Gann Box (software concept pages)
    author: charting software vendors
    year: 2024
    url: book
    type: secondary
confidence: low
---

## Purpose
A Gann square whose proportions are locked: one time unit equals a fixed number of price units, so the square keeps the same scale relationship (for example, the 1x1 angle) however it is resized.

## How the author meant it to be used
W. D. Gann's central claim was a fixed relationship between price and time, with angles such as the 1x1 (one price unit per bar) as the baseline for trend strength. A fixed square is the software way to enforce that relationship. This is a reading of the name;

## How you draw it
Likely two clicks: a start pivot and a size click. In a fixed square the time span and the price span follow from one dimension using the locked price-per-bar ratio, so only one of them is free; dragging a corner moves both. The ratio is a setting rather than being implied by the click. Anchoring is to a bar and a price. If the ratio is in price per bar, the square stays correct when the interval changes only if the price unit is rescaled to the new bar size, which tools handle in different ways. On log scale, a fixed price-per-bar ratio has no consistent meaning, so such tools usually warn or force linear.

## Geometry and levels
Same grid as the Gann square (eighths of each axis, diagonals, 1x1 line) but with price span = ratio times bar span.

## Standard defaults
A ratio such as 1 price unit per bar is the 1x1 case; OpenCandle seeds no default: two clicks place the box, squared on screen at placement, and the price-per-bar ratio is held when you drag.

## Reading it
As for the Gann square, with the added statement that the diagonal is a true 1x1 angle. The usual caveat applies: no rigorous evidence of predictive power.

## Common mistakes and edge cases
- Confusing "fixed" with a screen square. It fixes the data ratio, not the pixels.
- Changing interval without changing the price unit.
- Using on a log chart.

## How OpenCandle does it
- Two clicks. The box is squared on screen when you place it, then its price-per-bar ratio is held while you drag corners. Counted in bars.
- On a log chart a fixed price-per-bar ratio is not a square on screen, and there is no warning.

## Open questions
- Whether "fixed" means a fixed price-per-bar ratio, a fixed pixel aspect ratio, or fixed Gann degrees.
- No source defines this tool precisely. Confidence is low and the whole description is a best reading of the tool name.
