---
id: dw-gann-gann-square
name: Gann square
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
A square (or rectangle) grid over a chosen price and time span with diagonals and arcs, used to look for price and time "squaring" and for support and resistance at the divisions.

## How the author meant it to be used
W. D. Gann taught that price and time are proportional and that a market turns when time and price are in balance. Several figures carry his name: the Square of Nine (a number spiral), the Square of Four and Square of 144 (grids), and square-based angle work such as the 1x1 line (one price unit per time unit). The drawing tool named "Gann square" is a modern construction that borrows from these, so there is no single Gann-authored figure that equals it. Do not confuse the drawing with the Square of Nine, which is a different construct.

## How you draw it
Two clicks, opposite corners: a start pivot and an end point that sets the price range and time span. Both corners are draggable and the square resizes. The grid divides both axes into equal fractions (commonly eighths, with the 50 percent lines most important) and draws diagonals; sometimes arcs from the corners and the 1x1 line from the start corner. Price and time are your own scale: nothing forces the square to be square on screen. It is anchored to bars and prices, so it stays on its bars across interval changes while the number of bars inside it changes with the data. On a log scale, price divisions should be in displayed units or diagonals will not match grid crossings.

## Geometry and levels
Fractions 0, 1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8 and 1 of both axes (software convention). Diagonals connect corners and midpoints; the main diagonal is the 1x1 angle when price and time units are set equal. Crossings of diagonals with grid lines are the "squaring" points.

## Standard defaults
Eighths grid with diagonals; some tools offer thirds or Fibonacci fractions.

## Reading it
Watch price at the 50 percent lines and at diagonal crossings. Nothing here is a signal on its own; secondary sources note that these methods fit history easily and have no rigorous evidence of predictive power.

## Common mistakes and edge cases
- Thinking the square is square on screen; it is only square in the data units chosen.
- Bars vs calendar days: weekends change the time divisions on a calendar-based version.
- Inverted drawings (end before start) should still be symmetric.

## How OpenCandle does it
- Grid at 0, 0.25, 0.382, 0.5, 0.618, 0.75 and 1 on both axes (time counted in bars), a fan from 3x1 to 1x3 from corner 1, and arcs from 0.25 to 1.
- Fan labels use the "1x2" form.

## Open questions
- Which of the free (this tool) and fixed (the sibling "Gann square fixed" tool) versions locks the price-per-bar ratio.
- Whether OpenCandle divides time by bars or calendar days.
- No source defines this tool precisely.
