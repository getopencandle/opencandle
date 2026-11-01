---
id: trendstrength
name: Trend strength index
kind: indicator
family: trend
sources:
  - title: Trend strength index (correlation of price with time); no single author located
    author: common practice
    year: n/a
    url: n/a
    type: secondary
confidence: medium
---

## Purpose
Measures how closely recent closes follow a straight line in time: +1 is a perfectly steady rise, -1 a perfectly steady fall, near 0 no trend.

## How the author meant it to be used
No single author is credited. It is the Pearson correlation of close with bar index over a window; the idea of using correlation with time as a trend measure is standard statistics. Positive means uptrend, negative downtrend, magnitude means quality (steadiness), not speed. It says nothing about how fast price is moving.

## How you interact with it
Automatic, in its own pane with a zero line. Set the length. Nothing is placed. Each value uses the current and earlier bars only; the live bar changes until close. The line is coloured bullish when at or above zero and bearish below.

## Calculation
r = correlation between close(t-n+1..t) and bar index 0..n-1 over n bars. Equivalent to the regression slope scaled by the ratio of spreads. A window with a flat close has zero variance and is unavailable; any missing close in the window makes it unavailable.

## Standard defaults
Length 14 (OpenCandle choice; no standard stated).

## Reading it
Near +1 or -1 means a clean trend; hovering near zero means range or reversal. Crossing zero signals a change of the window's tilt, with lag.

## Common mistakes and edge cases
- Mixing up with ADX or with the true strength index; this is correlation.
- Short lengths oscillate wildly.
- Reading it as a speed measure.
- Spearman versus Pearson correlation differ slightly.

## How OpenCandle does it
- Uses Pearson correlation of the close against the bar index. Default length is 14.
- A flat window or a missing close gives no value.
- The line is coloured bullish at or above zero and bearish below.

## Open questions
Whether any original source defines the length and bands is unknown.
