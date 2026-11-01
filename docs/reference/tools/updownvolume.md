---
id: updownvolume
name: Up/Down volume
kind: indicator
family: volume
sources:
  - title: Inferring Trade Direction from Intraday Data (tick rule)
    author: Charles Lee and Mark Ready
    year: 1991
    url: book
    type: secondary
  - title: OpenCandle indicator definition
    author: OpenCandle
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
Splits each chart bar's volume into the part that traded up and the part that traded down, using finer (intrabar) data, and shows the up part above zero, the down part below zero and the net (delta) as a marker.

## How the author meant it to be used
There is no single author. The idea of classifying volume by trade direction comes from market-microstructure work; the tick rule (a trade at a higher price than the previous trade is a buy, lower is a sell, equal inherits the previous direction) is associated with Lee and Ready (1991), but the rule itself is not reproduced from that paper. Charting platforms usually approximate it from bars at a smaller interval.

## How you interact with it
Automatic, but it depends on data you do not see on the main chart. For each chart bar it loads smaller bars at an automatically chosen finer interval, or one you set with the custom timeframe option. A chart bar with no finer bars inside it stays blank (no fallback to the bar's own volume). The up/down split of the live chart bar changes as new finer bars arrive and is final only when the bar closes. Nothing is placed or dragged.

## Calculation
For each finer bar: if close is above open it counts as up; below open as down; if close equals open it is classified by its close against the previous finer bar's close (higher up, lower down); if equal again it keeps the previous direction (the tick-rule carry). The whole finer bar's volume goes to that side. Per chart bar: Up = sum of up volume (positive), Down = sum of down volume (negative), Delta = Up + Down. An unresolved first doji with no history is unavailable. A finer bar that overlaps the chart bar's end makes the bucket unavailable.

## Standard defaults
Automatic intrabar interval ladder, custom timeframe off. These are OpenCandle choices; there is no standard.

## Reading it
Zero line separates buyers from sellers. The delta marker is the net. Because the classification is by the finer bar's colour, not by true trade side, it is an estimate, and a coarser finer interval makes the estimate cruder.

## Common mistakes and edge cases
- Treating the split as exact buy and sell volume; it is a classification of whole finer bars.
- Expecting values on bars where finer data is missing or partial.
- Assuming the up/down split is final on the open bar.
- Mixing it up with Volume delta, which accumulates the same signed volume as candles.

## How OpenCandle does it
- Each finer bar is classified by close against open, then by close against the previous finer bar's close, then by carrying the previous direction. The whole finer bar's volume goes to that side. Volume delta uses the same classification.
- A chart bar with no finer bars stays blank; it does not fall back to the bar's own volume.
- A finer bar that crosses the end of the chart bar, or an unresolved first doji, leaves that bar blank.

## Open questions
No primary source exists for this exact method. Behaviour on bars with sparse finer data (exchange completeness) is a policy of OpenCandle, not a standard.
