---
id: zigzag
name: Zig zag
kind: indicator
family: swing / structure
sources:
  - title: ChartSchool, ZigZag
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/zigzag
    type: secondary
  - title: Filtered Waves, Basic Theory
    author: Arthur A. Merrill
    year: 1977
    url: book
    type: primary
confidence: medium
---

## Purpose
Connects significant swing highs and lows with straight lines and ignores all moves smaller than a chosen percentage. It simplifies price to its major swings, often as a base for Elliott wave counts, patterns, and retracement measurement.

## How the author meant it to be used
The filtered-wave idea goes back to Merrill's work (OpenCandle credits Merrill, 1977). ChartSchool is explicit that ZigZag is "not a technical indicator per se" but a filter, that it has no predictive power because it is drawn with hindsight, and that predictive value comes from what you apply to it (Elliott waves, pattern analysis, indicators, Fibonacci retracements). Its example: ZigZag(10) ignores any move under 10 percent; a rise from 100 to 109 draws no line, a rise to 110 does, and if price continues to 112 the line extends to 112.

## How you interact with it
Automatic. Inputs: Depth (minimum bars between pivots) and Deviation percent. No placement, nothing to drag. The most recent leg is provisional: it follows the current extreme and can shorten, extend or vanish as new bars arrive (repainting). A pivot becomes permanent only when price has reversed by the deviation from it. Earlier pivots are stable unless a new extreme in the same direction replaces the last pivot before a reversal is confirmed. Because the pivot is known only after the reversal, any signal built on it has a delay, and historical zig zags look better than live ones.

## Calculation
ChartSchool rules for high-low data: with the previous pivot a high, a new bar with a higher high replaces it; a new bar whose low is at least the threshold percent below the pivot high becomes a new pivot low; if both are true, the bar continues the current trend (it becomes the new high). Mirror for a pivot low. If the latest bar does not qualify, a temporary line runs from the last pivot to the latest bar's high or low (depending on its position relative to the pivot). Percent is measured from the previous pivot. OpenCandle follows the high/low variant with a deviation test of |move| / |pivot price| at least the deviation, and adds Depth: a reversal that comes sooner than Depth bars after the last pivot is ignored and the leg continues. Between pivots values are linearly interpolated by bar index. The last confirmed leg ends at the extreme itself, and a separate tail then runs from that extreme to the close of the newest bar, which differs from ChartSchool's high-or-low endpoint.

## Standard defaults
ChartSchool: 5 percent traditionally, but its tool chooses a percentage per security (examples 3.75 and 7.81). OpenCandle: Deviation 5 percent, Depth 10 (both are OpenCandle's own definitions).

## Reading it
Compare successive highs and lows for trend structure. ZigZag (retrace) in ChartSchool also labels each leg as a ratio of the prior leg, for example 0.638 or 1.646, for Fibonacci work; OpenCandle does not show that.

## Common mistakes and edge cases
- Treating the last leg as a confirmed swing.
- Using the zig zag as an entry signal; it lags by definition.
- Close-only versus high-low variants give different pivots.
- Straight lines between pivots do not follow price on log scale unless interpolated in log terms (OpenCandle interpolates by bar index on the plotted values).
- Large Depth can hide a real quick reversal.
- Changing interval, extending history or adding a new bar can move the last pivot.

## How OpenCandle does it
- Defaults are Deviation 5 percent and Depth 10. A reversal sooner than Depth bars after the last pivot is ignored.
- An outside bar that qualifies both ways extends the current leg, as in ChartSchool. The reversal is measured from the current extreme.
- The unfinished last leg runs to the extreme itself, and then a separate tail runs to the close of the newest bar. ChartSchool ends that tail at the newest bar's high or low.
- Between pivots the line is interpolated by bar index.

## Open questions
The meaning of Depth in the original reference tool is unverified. Drawing the tail to the newest close rather than the extreme is an OpenCandle choice that differs from ChartSchool.
