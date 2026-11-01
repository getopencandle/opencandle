---
id: avwap
name: Anchored VWAP
kind: indicator
family: VWAP
sources:
  - title: Anchored VWAP for Better Timing (author's own article on his site)
    author: Brian Shannon
    year: n/a
    url: https://alphatrends.net/anchored-vwap/
    type: primary
  - title: When, Where, Why to Set Anchored VWAP
    author: Brian Shannon
    year: 2024
    url: https://alphatrends.net/archives/when-where-why-to-set-anchored-vwap-brian-shannon/
    type: primary
  - title: Is It Smart to Rely on Anchored VWAP Alone?
    author: Brian Shannon
    year: 2025
    url: https://alphatrends.net/archives/is-it-smart-to-rely-on-anchored-vwap-alone/
    type: primary
  - title: Maximum Trading Gains With Anchored VWAP
    author: Brian Shannon
    year: 2023
    url: book
    type: primary
  - title: ChartSchool, Anchored VWAP and VWAP
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/anchored-vwap
    type: secondary
confidence: high
---

## Purpose
Shows the volume-weighted average price paid by everyone who traded since a chosen starting bar, i.e. the average cost basis of participants since an event.

## How the author meant it to be used
Shannon defines the anchored VWAP (AVWAP) as the same as VWAP except that the start point is set by you at a specific meaningful point, not simply the start of the day. He calls the anchor point "the most subjective part" of the analysis. Anchors he names: earnings and other news, FOMC announcements, major swing highs and lows, strong reversals, the first trade of the year, and the week's opening trade (the book covers selection in detail). He frames the line as a sentiment and cost-basis gauge: a stock above an advancing AVWAP means buyers are in control for that timeframe; below a declining AVWAP, sellers; oscillation around it, indecision. He describes price above a rising AVWAP as "innocent until proven guilty" and below a declining one as the reverse.

Interaction rules from his pages: treat the AVWAP as a zone of interest and a place to look for evidence, not a mechanical signal; if price slices through, do not hold and hope; watch for resistance turning into support after a decisive move above; clusters of anchors mark higher-interest zones; remove anchors that are no longer relevant to keep the chart clean; use colors for different anchors. He also says AVWAP is not a standalone tool: market structure and the 5-day moving average come first, and AVWAP refines timing and risk. Shannon says the line is calculated the same on any timeframe, and for accuracy he advises using the shortest timeframe that remains legible.

Origin of VWAP: he cites Berkowitz, Logue and Noser (Journal of Finance, March 1988) as the execution-benchmark source, and notes it was not a charting tool.

## How you interact with it
You place it: adding the study asks for a click on the anchor bar. To move it, use Change anchor in the study's legend or its right-click menu. ChartSchool describes the same flow (hover and click the bar, or edit the anchor date and time fields). Until an anchor is set nothing is drawn. Once placed, the line is computed from the anchor to the latest bar and updates live; it does not reset at session boundaries. The anchor is stored as a time rather than a bar index, so it never moves on its own: loading older history, new bars and interval changes leave it where it is. Multiple anchors can coexist (ChartSchool and Shannon both say so).


## Calculation
Shannon: VWAP = sum(price x shares) / total shares over the period studied; the AVWAP is the same formula started at the anchor and running to the latest bar. For bar data the per-bar price is the platform's choice. ChartSchool's VWAP uses typical price (high + low + close) / 3 times volume, with the first value equal to the typical price of the first bar. Shannon does not state a bar price source. AVWAP = cumulative sum(price_i * volume_i) / cumulative sum(volume_i), both sums from the anchor bar through the current bar. Bands, when shown, are volume-weighted standard deviations around the line (a practitioner extension, not part of Shannon's description). The value at a closed bar does not change later; the live bar updates until close. No values before the anchor.

## Standard defaults
No fixed number; the only parameter is the anchor (and a price source). Shannon states there are no settings, adjustments or offsets on the plain VWAP.

## Reading it
Pullbacks to a rising AVWAP from a significant low are read as tests of the average buyer's cost (Shannon's AVWAP-as-support examples). A close back through it after a rally suggests the average holder is now at a loss. Multiple AVWAPs converging are read as stronger support or resistance (stated by both Shannon and ChartSchool).

## Common mistakes and edge cases
- Zero or missing volume (forex, some indices): the weighted average is undefined; need a clear fallback or message.
- Anchor on a bar before data start or inside a gap.
- Anchoring to a bar index so it drifts when more history loads.
- Resetting at session open on intraday charts (that is session VWAP, a different tool).
- Mixing extended hours: Shannon notes pre- and post-market inclusion is your choice that changes the line.
- Anchors on daily data ignore the intraday distribution.
- Too many anchors cluttering the chart.

## How OpenCandle does it
- You click a bar to place the anchor; Change anchor in the legend or right-click menu moves it. With no anchor, nothing is drawn. The anchor never moves on its own.
- The anchor is stored as a time and read on the exchange clock (New York for US stocks, UTC otherwise). If it falls between bars, the first bar after it is used; an anchor after the last loaded bar draws nothing yet.
- The default price source is HLC3 (typical price). Bars before the anchor have no value. A bar with a missing price or volume is skipped and the sums carry on.
- Bands use the volume-weighted population standard deviation. Band 1 is on at 1 standard deviation; bands 2 and 3 are off by default at 2 and 3. A percentage band mode is also available.
- The line does not reset at session boundaries; that is session VWAP, a different tool.

## Open questions
Shannon's full anchor-selection criteria are in his book. His preferred bar price source is not stated. Whether OpenCandle lets the anchor be dragged after placement should be confirmed.
