---
id: fibextensiontrend
name: Trend-based Fibonacci extension
kind: drawing
family: Fibonacci
sources:
  - title: Fibonacci Applications and Strategies for Traders
    author: Robert Fischer
    year: 1993
    url: book
    type: primary
  - title: Trading with DiNapoli Levels
    author: Joe DiNapoli
    year: 1998
    url: book
    type: primary
  - title: Harmonic Trading, Volume One
    author: Scott Carney
    year: 2010
    url: book
    type: primary
  - title: Harmonic Patterns (ChartSchool)
    author: Suri Duddella
    year: 2014
    url: https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/harmonic-patterns
    type: secondary
confidence: low
---

## Purpose
Projects where a move may end by measuring a previous swing (A to B) and laying it again, scaled by Fibonacci ratios, from the end of the pullback (C).

## How the author meant it to be used
This is a projection (measured-move) tool, distinct from a retracement. DiNapoli's "objective points" lay the first swing from the pullback end at 61.8%, 100% and 161.8%. Carney separates vocabulary: a retracement measures back into a leg, a projection lays one leg's length from the end of a later leg, and an extension goes beyond the start of a leg. Much software calls all of these "extension", a common source of confusion. Targets are zones to watch or take profit, not guarantees.

## How you draw it
Three clicks. 1: A, the start of the first swing. 2: B, the end of the first swing. 3: C, the end of the counter-move. The projection base is C, the direction is the direction of A to B, and the reference length is |B - A|. Level price = C + ratio x (B - A), signed, so a down-move projects downward. All three points are draggable and levels recompute. Levels are horizontal from C to the right. The tool is anchored in time and price, not bar counts. On a log scale a faithful projection scales the percentage move rather than the price difference (see open questions).

## Geometry and levels
Common ratios: 0.382, 0.618, 1.0 (equal move, the AB=CD idea), 1.272, 1.618, 2.0, 2.618, sometimes 3.618 and 4.236. 1.272 is the square root of 1.618 and 2.618 its square. ChartSchool's harmonic article lists 0.382, 0.618, 0.786, 1.0, 2.0, 2.62, 3.62 and 4.62 as the key derived set.

## Standard defaults
0, 0.618, 1, 1.618, 2.618 are widely used; 1.272 is usually added.

## Reading it
A move that stalls near 100% or 161.8% of the first swing is common. Confluence with other projections or retracement levels (price clusters) is the recommended way to use it, since a single projection is weak. ChartSchool's harmonic article makes the same point with its Pattern Completion Zone idea.

## Common mistakes and edge cases
- Clicking C beyond A (invalid structure): still project from C using the A to B direction.
- Using Carney's terms interchangeably.
- Log scale and long-term charts: linear projections can run below zero or look too far.
- Zero-length A to B puts all levels at C.

## How OpenCandle does it
- Levels are C + ratio x (B - A) in plain price. There is no log option.
- Lines start at point C and run one A-B width in the drawn direction, or to the chart edge when Extend right is on.
- 12 levels are on by default: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618, 3.618 and 4.236.

## Open questions
- Whether OpenCandle's 0 level is at C and whether it works in log space on log charts.
- Default level set and whether 4.236 is included.
- Book citations in the sources list are background reading and were not re-checked line by line.
