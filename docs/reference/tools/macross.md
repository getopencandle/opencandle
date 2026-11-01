---
id: macross
name: MA Cross
kind: indicator
family: moving average crossover
sources:
  - title: Moving average crossovers (common charting convention)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
Plots two moving averages and marks the bars where they cross.

## How the author meant it to be used
No single author; the crossover is a long-standing convention. A faster average crossing above a slower one marks a rising trend change; crossing below marks a falling one (the "golden cross" and "death cross" at 50 and 200 are the best-known pair). Crossover systems whipsaw in ranges; filters (time, percent, confirming indicators) are common.

## How you interact with it
Automatic overlay. Inputs: short length, long length, source. The cross is known at the close of the bar where the sign of (short - long) changes. No look-ahead and no repaint on closed bars; an open bar can create or remove a cross until it closes.

## Calculation
Short = SMA(short length), Long = SMA(long length) of the source. Marker on bar t when (short - long) moves from <= 0 to > 0 (up cross) or from >= 0 to < 0 (down cross), with both values present on t and t - 1.

## Standard defaults
9 and 21 simple averages (OpenCandle choice, not canonical). 50/200 is the classic long-term pair.

## Reading it
A cross shows that the averages have swapped order, not that the trend will continue. Combine with other evidence.

## Common mistakes and edge cases
- A touch without a sign change is not a cross.
- Choice of SMA vs EMA changes cross timing.
- Flat equal values (short = long) need a rule for ties.

## How OpenCandle does it
- Defaults are simple averages of 9 and 21.
- A touch counts: a difference that goes positive, to exactly zero, then positive again marks a cross on the third bar. This is rare with real prices.

## Open questions
None, apart from OpenCandle's tie rule (>= 0 to > 0 counts).
