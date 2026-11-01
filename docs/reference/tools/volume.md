---
id: volume
name: Volume
kind: indicator
family: volume
sources:
  - title: Volume as a bar histogram with an optional moving average (no single author)
    author: common charting convention
    year: n/a
    url: common charting convention
    type: secondary
confidence: medium
---

## Purpose
Shows how much traded in each bar, as columns under the price chart, plus a moving average of volume to show what is normal.

## How the author meant it to be used
No single author; volume has been plotted under price since the early days of chart analysis, and Dow-era writers already treated rising volume as confirmation of a trend. Common practice: volume should expand in the direction of the trend and contract in counter-trend moves; a breakout on high volume is more credible than one on thin volume; a spike on a reversal bar can mark exhaustion. Volume is judged against its own recent average, which is why the moving average is drawn.

## How you interact with it
Automatic. Inputs: moving-average length and moving-average type. No placement. Each bar's column is the bar's volume; the live bar's column grows as trades arrive and is final only at the close. The average at a bar uses that bar and earlier ones. Columns are coloured by candle direction (up when the close is at or above the open); the colour does not mean buy or sell volume.

## Calculation
Column height = bar volume. Moving average = SMA (or the chosen type) of volume over the length. OpenCandle defaults to a 20-period average. Missing volume is shown as a gap; negative or non-finite volume is treated as unavailable.

## Standard defaults
Length 20 (OpenCandle). Other platforms commonly use 20 or 50.

## Reading it
Compare each column with the average line: well above is heavy, below is light. Volume is not comparable across symbols or between regular and extended sessions without care, and on intraday charts it follows a typical U-shape through the session.

## Common mistakes and edge cases
- Comparing live-bar volume with full-bar averages early in the bar.
- Mixing data sources with different volume definitions (consolidated vs single venue, shares vs contracts).
- Instruments with no volume (some indices, forex spot) show nothing.
- Colour does not mean buy or sell volume; it is the bar's direction.

## How OpenCandle does it
- The average line defaults to a 20-bar simple average.
- Missing volume is shown as a gap; negative or non-finite volume is treated as unavailable.

## Open questions
Exact up/down colour rule and how zero-volume bars are drawn were not checked for OpenCandle.
