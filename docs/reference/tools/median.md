---
id: median
name: Median
kind: indicator
family: volatility band / smoothing
sources:
  - title: Rolling median with ATR bands
    author: unknown
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
A rolling median of price (robust to single outliers), its exponential average, and bands at a multiple of average true range around the median.

## How the author meant it to be used
No single author; this is a community indicator. The rolling median ignores one-bar spikes better than a mean. The EMA of the median and the ATR bands give a direction cue and an envelope: the median EMA turning, and price outside the bands, are the usual reads.

## How you interact with it
Automatic overlay. Inputs: source (default hl2), median length, ATR length, ATR multiplier. Known at bar close; no repaint on closed bars.

## Calculation
Median = median of the source over the last n bars (an even n takes the mean of the two middle values). Median EMA = EMA(Median, n) (SMA-seeded). ATR is Wilder's RMA of true range over the ATR length. Upper = Median + m x ATR; lower = Median - m x ATR.

## Standard defaults
Source hl2, median length 3, ATR 14, multiplier 2 (OpenCandle; the community default is not confirmed).

## Reading it
Median above its EMA is rising; a close outside a band flags an extension.

## Common mistakes and edge cases
- Confusing this with the Median price indicator, which is only (high + low) / 2.
- Tie-handling for even n.
- Short median length makes it nearly the raw source.

## How OpenCandle does it
- Defaults: source hl2, median length 3, ATR length 14 (Wilder smoothing), multiplier 2. These are OpenCandle's choices.
- The EMA of the median uses the median length. With an even length, the median is the mean of the two middle values (some versions pick one of them instead).

## Open questions
Original parameters, the EMA length and seeding differ between versions; confidence is low.
