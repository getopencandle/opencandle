---
id: anchoredvwap
name: Anchored VWAP
kind: drawing
family: VWAP
sources:
  - title: Anchored VWAP (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/anchored-vwap
    type: secondary
  - title: Volume-Weighted Average Price (VWAP) (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/volume-weighted-average-price-vwap
    type: secondary
  - title: Technical Analysis Using Multiple Timeframes
    author: Brian Shannon
    year: 2008
    url: book
    type: primary
  - title: The Total Cost of Transactions on the NYSE
    author: Berkowitz, Logue, Noser
    year: 1988
    url: book
    type: primary
confidence: medium
---

## Purpose
Shows the volume-weighted average price paid by everyone who traded since a chosen bar. It is a running "average cost" line that answers whether buyers or sellers have been in control since a specific event.

## How the author meant it to be used
VWAP began as an execution benchmark for institutions (the 1988 transaction-cost study is the usual first citation). Brian Shannon (AlphaTrends) adapted it for discretionary traders by letting the chartist pick the start bar, normally a bar that changed market psychology: a major swing high or low, an earnings gap, a breakout, news. Price action before that bar is deliberately excluded. Price above the line means buyers since the event are in profit; below means sellers are. Several anchored lines from different events can be stacked, and confluence is read as stronger support or resistance. The detail here comes from ChartSchool's account of Shannon's approach; treat the attribution as secondary.

## How you draw it
One click: the click chooses the anchor bar. The line starts at that bar and runs to the latest bar. The anchor is a bar (a point in time), so it must stay at that time when the chart is panned, zoomed, or switched to a different interval; on a new interval the anchor snaps to the bar that contains the same instant, and the whole line is recomputed from that interval's data. The price of the click is irrelevant to the calculation. Dragging moves the anchor in time only. The line is computed from data, not drawn between two points, so log versus linear scale changes only how it looks, not its values.

## Geometry and levels
For each bar i from the anchor: VWAP_i = sum(price_k x volume_k) / sum(volume_k) over bars k from the anchor through i. The usual per-bar price is the typical price (high + low + close) / 3; some sources use the close or the bar midpoint. Optional bands at plus and minus N standard deviations of the volume-weighted price are common in implementations but are not part of the basic definition (sources differ on this). The anchor bar's own volume is included. Bars with zero volume contribute nothing; if all bars so far have zero volume the line is undefined.

## Standard defaults
Typical-price source, no bands, line extended to the last bar. There is no default anchor; the click supplies it.

## Reading it
Anchored from a low, a price holding above the line suggests demand is still in control; a close back below it suggests buyers since the anchor are now underwater. The reverse applies from a high. Because the average includes all volume since the anchor, the line moves slowly late in a long run and is a steadier reference than a moving average. ChartSchool stresses using it with other indicators and analysis, not alone.

## Common mistakes and edge cases
- Instruments with unreliable volume (spot forex, some indices): the line reflects tick counts or nothing.
- Anchoring on one interval and viewing on another: a daily anchor viewed on 5-minute bars should begin at the first intraday bar of that day.
- Anchor placed in a gap, weekend or holiday should snap to the next real bar.
- Anchor to the right of the data, or earlier than the loaded history: the line should be empty or clipped, never wrong.
- Different volume definitions (traded vs tick) give different lines.

## How OpenCandle does it
- Starts on the bar that contains the anchor, on any interval. A 5-minute anchor viewed on Daily starts on that day's bar.
- Draws nothing until there is volume, and says so, instead of showing an equal-weight average labelled VWAP. Leading bars with no volume are skipped.
- Typical price only; the source is not selectable.
- A band of plus and minus 1 volume-weighted standard deviation is shaded by default. The band multiplier cannot be set to 0.

## Open questions
- Which price source OpenCandle uses per bar and whether it is selectable.
- Whether standard-deviation bands exist and how they are weighted.
- Behaviour when the anchor is earlier than the first loaded bar after an interval change.
- Book citations in the sources list are background reading and were not re-checked line by line.
