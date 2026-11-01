---
id: cvd
name: Cumulative volume delta
kind: indicator
family: volume
sources:
  - title: Order-flow volume delta (common practice; no single author located)
    author: unknown
    year: n/a
    url: book
    type: primary
confidence: low
---

## Purpose
Tracks the running net of buy volume minus sell volume, to show which side was the more aggressive over a period.

## How the author meant it to be used
No identifiable creator or primary text; it comes from order-flow and footprint-style analysis. The general idea: classify each unit of volume as buying or selling pressure, subtract, and accumulate. Rising CVD with rising price confirms the move; price making new highs while CVD does not is a divergence. Exact classification rules are not standardised.

## How you interact with it
Automatic, needing finer bars than the chart. OpenCandle estimates the delta from intrabar (lower timeframe) data: each chart bar is built from smaller bars whose signed volumes are summed. Inputs: anchor period (Day, Week, Month, Year), optional custom timeframe. The cumulative total resets at the start of each anchor period, using the chart's declared calendar (New York for US equities, UTC otherwise). Display is OHLC candles of the cumulative value, so each bar shows the open, high, low and close of the running delta inside it. A chart bar with no intrabar coverage or an unresolved direction makes the value unavailable until the next anchor. Values for a bar are final only when the bar and its intrabar data are complete.

## Calculation
Per chart bar: signed volume of each intrabar candle (direction decided by OpenCandle's own rule, from the intrabar candle itself), summed to the bar's delta. Running total = previous total + delta, reset at each anchor. Candle open = total before the bar, close = after; high and low come from the path of the intrabar running total.

## Standard defaults
Anchor Day (OpenCandle).

## Reading it
Compare slope and divergence versus price within the same anchor period. Absolute values are not comparable across periods because of the resets, or across symbols and data sources.

## Common mistakes and edge cases
- Treating it as true buy/sell tape data; intrabar estimates are approximations.
- Comparing across an anchor reset.
- A chart bar with no intrabar data, or with an intrabar candle that straddles the bar or cannot be resolved, blanks the rest of the anchor period. A chart bar that is missing only some of its intrabars is accepted, and its delta is silently too small.
- Zero volume bars add nothing.

## How OpenCandle does it
- Each intrabar candle's direction comes from its open versus its close; if they are equal, the tick rule is used and a zero tick carries the previous direction.
- The running total resets at each anchor period in the chart's calendar (New York for US stocks, UTC otherwise); the first period starts at the first loaded bar.
- A chart bar with no intrabars, an intrabar that straddles a bar edge, or an unresolved direction leaves the rest of the anchor period blank.
- A chart bar that is missing only some of its intrabars is accepted and its delta is too small, with no warning.

## Open questions
No authoritative sign rule for classifying intrabar volume exists; OpenCandle's rule is its own. Reset calendar conventions differ for 24-hour markets.
