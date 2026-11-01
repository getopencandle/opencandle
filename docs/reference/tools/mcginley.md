---
id: mcginley
name: McGinley dynamic
kind: indicator
family: adaptive moving average
sources:
  - title: McGinley Dynamics, MTA Journal
    author: John R. McGinley Jr.
    year: 1997
    url: book
    type: primary
  - title: McGinley Dynamic (MCGD)
    author: TA-Lib project
    year: n/a
    url: https://ta-lib.org/functions/mcgd.html
    type: secondary
confidence: medium
---

## Purpose
A moving average that speeds up when price runs away from it and slows when price hugs it, to cut lag and whipsaw.

## How the author meant it to be used
McGinley (Market Technicians Association Journal, 1997 per TA-Lib's reference; other sources say 1990) designed it as a smoother-tracking alternative to moving averages. He suggests choosing N about 60 percent of the length of the simple average you want to emulate (a 12 to follow a 20-bar average). Use as a trend line: price above is bullish, below bearish.

## How you interact with it
Automatic overlay. Inputs: length and source. Known at bar close; recursive, so the starting value matters.

## Calculation
MD[0] = price[0]; MD[i] = MD[i-1] + (price[i] - MD[i-1]) / (N x (price[i] / MD[i-1])^4). The step is a fraction 1 / (N x (x/MD)^4) of the gap: smaller than 1/N when price is above the line, larger when below, so it tracks falling prices faster. In OpenCandle that fraction is capped at 1, so the line never passes price. Some implementations write the denominator as 0.6 x N x (x/MD)^4, which equals this at period 0.6 x N. TA-Lib's default N is 14 and its first output is at bar N - 1; OpenCandle starts on the first finite value.

## Standard defaults
N = 14 (TA-Lib, OpenCandle). The 60 percent rule applies when matching an SMA.

## Reading it
Trend direction and price location. Because it is price-ratio based, it is meant for positive prices.

## Common mistakes and edge cases
- Including or omitting the 0.6 constant: this changes the effective N.
- Prices at or crossing zero break the ratio.
- Seed differences decay by about (1 - 1/N) per bar.
- The step toward price is capped at the full gap, so one bar far below the line cannot push the line past price, to zero or negative.

## How OpenCandle does it
- Uses McGinley's original formula, without the 0.6 factor. The default length is 14.
- Starts from the first valid price. The step toward price is capped so the line can move at most to the price and never past it.
- Meant for positive prices only: a zero price breaks the ratio and restarts the line.

## Open questions
Original publication date (1990 vs 1997) differs between sources, and sources differ on whether the original formula includes the 0.6 factor.
