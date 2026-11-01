---
id: gaps
name: Gaps
kind: pattern
family: price gaps
sources:
  - title: Technical Analysis of Stock Trends
    author: Robert D. Edwards and John Magee
    year: 1948
    url: book
    type: primary
  - title: Gaps and Gap Analysis
    author: StockCharts ChartSchool
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/gaps-and-gap-analysis
    type: secondary
confidence: medium
---

## Purpose
Marks empty price areas between consecutive bars and tracks whether later price fills them.

## How the author meant it to be used
Edwards and Magee treat gaps as formations whose meaning depends on type. ChartSchool summarises four types: common gaps sit in ranges and usually fill quickly; breakaway gaps leave a congestion area on strong volume and often stay open; runaway gaps appear mid-trend; exhaustion gaps come near the end of a move. The type is a judgement from context and volume, not derivable from two bars.

## How you interact with it
Automatic. Inputs: minimal deviation percent, maximum number of gaps shown, whether filled gaps stay visible. Nothing to place or drag. A gap is known on the bar that creates it (it needs only that bar and the one before). A box end moves only when a later bar fills it; the gap signal itself never changes.

## Calculation
Gap up: current low above the prior high. Gap down: current high below the prior low (ChartSchool). The gap area is the space between those two prices. It is filled when price trades back through the far edge, i.e. to the prior bar's edge on the other side of the empty zone. A minimal-deviation filter drops gaps smaller than the given percent. A partial fill does not shrink the box, and the box is drawn from the gap bar.

## Standard defaults
None from the literature. Filter 0 percent, 20 gaps, filled gaps shown are OpenCandle choices.

## Reading it
Up gaps are generally bullish and down gaps bearish. Significance rises with above-average volume. ChartSchool says gaps are common on daily charts, rare on weekly and monthly, and that near-daily gaps in thin securities carry little meaning. Intraday opening gaps that fill the same day are ordinary volatility.

## Common mistakes and edge cases
- Treating a close-to-open difference as a gap when the bar ranges overlap.
- Session boundaries and extended hours change what counts as a gap.
- Naming a gap type without volume and context.
- Expecting every gap to fill.

## How OpenCandle does it
- A gap is filled only when price trades back through the far edge of the empty area. The prior close is not the test, and a partial fill does not shrink the box.
- Overnight and session gaps on intraday charts count as gaps; there is no session filter.

## Open questions
Sources differ on what "filled" means (back to the prior close versus across the whole empty area); OpenCandle uses the whole empty area.
