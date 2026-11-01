---
id: majority
name: Majority rule
kind: indicator
family: breadth / momentum
sources:
  - title: Majority rule
    author: unknown
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
Shows what share of the last N bars closed up, as a percentage.

## How the author meant it to be used
The definition is from OpenCandle's design: the percentage of bars in a rolling period that closed above the prior close. A reading above 50 means a majority of recent bars were up bars; below 50, down bars. Typical use is as a simple momentum or trend-persistence gauge (high values overbought, low oversold), but no authoritative thresholds are known.

## How you interact with it
Automatic, in its own pane. One input: rolling period. Known at bar close; no repainting on closed bars.

## Calculation
up_t = 1 if close_t > close_(t-1), else 0 (an unchanged close is not an up bar). Majority = 100 x (sum of up over the last N bars) / N.

## Standard defaults
N = 14 (OpenCandle); 50 is the neutral line.

## Reading it
Steps between 0 and 100 in increments of 100 / N; it is noisy and quantised for small N.

## Common mistakes and edge cases
- Counting unchanged closes as up bars.
- The first bar has no prior close, so the first value appears on bar N + 1.
- Output moves in steps, not smoothly.

## How OpenCandle does it
- A bar counts as up only when its close is above the previous close. An unchanged close counts as not up.
- Default period is 14, with 50 as the neutral line. The first value appears on bar N + 1.
- The definition is OpenCandle's own: no published source sets the thresholds.

## Open questions
No authoritative source gives the tie rule or the standard thresholds.
