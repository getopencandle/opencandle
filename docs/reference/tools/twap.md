---
id: twap
name: Time weighted average price
kind: indicator
family: average price
sources:
  - title: Execution benchmark convention (TWAP), no single author
    author: common practice
    year: n/a
    url: n/a
    type: secondary
confidence: medium
---

## Purpose
The simple average of price across equal time slices of a period; used as an execution benchmark and an intraday fair-value line.

## How the author meant it to be used
No single author. TWAP comes from execution trading: an order sliced evenly in time should average the TWAP, so the benchmark measures execution quality. As a chart overlay it is compared with VWAP: TWAP ignores volume, so each bar counts equally. Price above it suggests buyers in control within the period.

## How you interact with it
Automatic overlay that resets at the start of each anchor period (1 hour, 4 hours, 1 day, 1 week, 1 month, 3 months, 12 months). You set anchor period and source; there is no click placement. It uses only the current and earlier bars of the period, so it never repaints, but it restarts at each boundary and the first bar of a period equals its source. The anchor should span several bars to be useful.

## Calculation
TWAP(t) = mean of the source over all bars of the current period up to and including bar t. A missing source does not count. Default source is ohlc4. Day and longer periods follow the New York calendar for US equities and UTC otherwise; hour periods follow the UTC clock (OpenCandle choices).

## Standard defaults
Anchor 1D, source ohlc4, offset 0.

## Reading it
Use like VWAP when volume is unreliable or absent (for example some spot or index data). Distance from TWAP shows stretch.

## Common mistakes and edge cases
- Weighting by volume (that is VWAP).
- Weighting bars by their duration when bars are uneven: here every bar counts equally.
- Pre/post-market inclusion changes the mean.
- Timezone of the period reset.
- Anchor period shorter than the chart interval gives no averaging.

## How OpenCandle does it
- Every bar counts equally, whatever its length or volume. Default source is ohlc4.
- It resets at the start of each anchor period. A week starts on Monday.
- Day and longer periods follow the New York calendar for US stocks (so pre-market bars join that day) and UTC otherwise. Hour periods follow the UTC clock.

## Open questions
The exact source default and boundary clock in other tools were not verified.
