---
id: schiffpitchfork
name: Schiff pitchfork
kind: drawing
family: pitchfork
also: [modifiedschiffpitchfork]
sources:
  - title: Andrews' Pitchfork (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/andrews-pitchfork
    type: secondary
  - title: The Best Trendline Methods of Alan Andrews and Five New Trendline Techniques
    author: Patrick Mikula
    year: 2000
    url: book
    type: secondary
confidence: low
---

## Purpose
Variants of the Andrews pitchfork that move the starting point of the fork toward the second pivot, producing a flatter (less steep) median line. They are used when the original fork would be too steep and break immediately.

## How the author meant it to be used
Jerome Schiff, a student of Alan Andrews, proposed moving the fork's origin; Andrews is reported to have suggested a further small change that became the "modified" Schiff. Secondary descriptions say the original Schiff form suits steep or accelerating trends (it flattens the slope), and the modified form is used in sideways or choppy markets. The year of Schiff's work is approximate and

## How you draw it
Same three clicks as the Andrews pitchfork: P1 (the handle start), P2, P3. The tool then shifts the fork's origin (the "anchor") to a derived point A' before drawing, but the drawn points you can drag stay P1, P2 and P3. The median line starts at A' (not at P1), passes through the midpoint M of P2 and P3, and extends right. The outer lines still pass through P2 and P3 and are parallel to the median line. Everything is anchored in time and price. As with the Andrews fork, construct the lines in the displayed price scale.

## Geometry and levels
Original Schiff: A' keeps P1's time but moves half the price distance toward P2, i.e. A' = (time of P1, price = (price P1 + price P2) / 2). This is the form most sources call the "Schiff" fork. Modified Schiff: A' is the midpoint of the P1 to P2 segment in both time and price, A' = ((t1 + t2) / 2, (p1 + p2) / 2). Both then use M = midpoint of P2 and P3 for the median line, and parallels through P2 and P3.
Naming disagrees between sources: some call the time-and-price midpoint form "Schiff" and the price-only form "Modified Schiff". OpenCandle follows the more common naming: "Schiff pitchfork" draws the price-only origin at the first pivot's bar, and "Modified Schiff pitchfork" draws the time-and-price midpoint.

## Standard defaults
Median line and two parallels; optional internal fork lines as in the Andrews pitchfork.

## Reading it
Read as for the Andrews fork: outer lines are support and resistance, the median line is the target price returns to, and breaks signal trend changes. The flatter slope means the fork usually contains more of the existing price action.

## Common mistakes and edge cases
- Confusing which variant moves time and which does not.
- Dragging P1 and expecting A' to stay: A' is derived and moves with P1 and P2.
- Under log scale, the "midpoint" of price should be taken in the displayed scale to keep lines straight.

## How OpenCandle does it
- "Schiff pitchfork" uses the price-only origin at the first pivot's bar. "Modified Schiff pitchfork" uses the time and price midpoint.
- The Modified Schiff time midpoint is counted in bars, so weekends do not shift it.
- On a log chart the origin sits on the dashed construction line, so it stays on the line you see.

## Open questions
- Whether the common naming matches Schiff's own.
- No primary source on Schiff's own definition was found.
- Book citations in the sources list are background reading and were not re-checked line by line.
