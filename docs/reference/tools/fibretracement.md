---
id: fibretracement
name: Fibonacci retracement
kind: drawing
family: Fibonacci
sources:
  - title: Fibonacci Retracements (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-retracements
    type: secondary
  - title: Fibonacci Applications and Strategies for Traders
    author: Robert Fischer
    year: 1993
    url: book
    type: primary
  - title: Fibonacci Analysis
    author: Constance Brown
    year: 2008
    url: book
    type: primary
  - title: Elliott Wave Principle
    author: A. J. Frost and Robert Prechter
    year: 1978
    url: book
    type: primary
confidence: medium
---

## Purpose
Marks horizontal price levels at fixed fractions of a prior move, to estimate how far a pullback or bounce may go before the original trend resumes.

## How the author meant it to be used
The number sequence is old (1202), but its use on markets comes through Elliott-wave work (Frost and Prechter treat 61.8% and 38.2% as typical wave 2 and wave 4 depths) and 1990s books by Fischer, Brown and DiNapoli. Retracement levels are zones to watch, not exact turning points: ChartSchool calls them alert zones that need confirmation from candlesticks, momentum, volume or patterns. The older Dow-style rule that a trend retraces one third to two thirds, with 50% most common, is why 50% is on the grid even though it is not a Fibonacci ratio.

## How you draw it
Two clicks: first the start of the move, second the end of the move (swing low then swing high for an advance, or the reverse). Levels are measured from the end point back toward the start: 0% sits at the end point, 100% at the start, so a 61.8% level of an up-move is end - 0.618 x (end - start). Levels are horizontal and extend right (optionally left). Both anchors are points in time and price, can be dragged, and levels recompute from the new prices. Anchors stay at their time and price across interval changes; the drawing lives in time coordinates, not bar counts. On a log scale the faithful construction takes the retracement in log space (a percentage of the percentage move), which gives different level prices than the linear one; because both are in use, the choice should be explicit. Swapping start and end flips the direction of the grid.

## Geometry and levels
Ratios and origin: 0.236 (a number divided by the one three places higher), 0.382 (two places), 0.618 (one place, reciprocal of the golden ratio), 0.5 (Dow, not Fibonacci), 0.786 (square root of 0.618, popular with harmonic traders). 1.0 is the full retracement. Levels above 1.0 (1.272, 1.618) belong to projections but are sometimes shown on the same tool.

## Standard defaults
0, 0.236, 0.382, 0.5, 0.618, 0.786, 1 is the common set. ChartSchool's own tool shows 23.6, 38.2, 50 and 61.8.

## Reading it
Shallow (23.6%) retracements suit flags; moderate (38.2 to 50%) and golden (61.8%) are the main zones; the 38.2 to 61.8 band contains most useful pullbacks. A close beyond 100% negates the premise. The standing author-level warning is subjectivity: different swing choices give different grids, so levels from several swings that cluster are worth more than any single grid.

## Common mistakes and edge cases
- Picking the wrong swing (intrabar extremes vs closes).
- Label order: 0 at the end point and 1 at the start surprises people who expect the reverse.
- Linear vs log differences become large for big moves; a linear grid on a log chart shows unevenly spaced lines.
- Very small ranges make labels overlap; inverted drawings just flip the grid.
- Gaps and weekends do not matter for levels (price only), but they affect horizontal extent if x is bar-based.

## How OpenCandle does it
- 0% sits at the end point and 100% at the start point.
- Default levels are 0, 0.236, 0.382, 0.5, 0.618, 0.786 and 1.
- Levels are linear in price unless "Levels based on log scale" is on. That option is offered only when the price scale is logarithmic.

## Open questions
- Whether OpenCandle computes levels in log space on log charts and whether that is selectable.
- Which default level set, and whether 0.786 and extension levels are on by default.
- Whether a reverse option swaps which end is 0%.
- Book citations in the sources list are background reading and were not re-checked line by line.
