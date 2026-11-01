---
id: wma
name: Weighted moving average
kind: indicator
family: moving average
sources:
  - title: TA-Lib WMA source, ta_WMA.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_WMA.c
    type: secondary
  - title: Moving average, weighted moving average section
    author: Wikipedia contributors
    year: n/a
    url: https://en.wikipedia.org/wiki/Moving_average
    type: secondary
confidence: high
---

## Purpose
A moving average that gives the newest bar the largest weight and older bars steadily smaller weights, so it follows price more closely than a simple average of the same length.

## How the author meant it to be used
No single inventor; the linearly weighted average is a standard smoothing tool. Wikipedia notes that in finance "weighted moving average" has the specific meaning of weights that fall in arithmetic progression. Used as a trend line, a dynamic support or resistance, crossovers between two lengths, and as the building block of the Hull moving average. It lags less than an SMA and more than a short EMA.

## How you interact with it
Automatic. Inputs: Length and Source. No placement. The value at a bar uses that bar and the previous n - 1. It is known at the close; on the live bar it changes with each tick, because the newest bar has the largest weight.

## Calculation
For length n, the newest value gets weight n, the previous n - 1, down to 1 for the oldest in the window. WMA = sum(weight x value) / (n x (n + 1) / 2). TA-Lib uses this exact divider and incremental update. The first value appears at bar n. Missing values in the window make the result unavailable.

## Standard defaults
Length 9 in OpenCandle. No universal standard; common lengths are 9, 10, 20 and 50.

## Reading it
Price above a rising WMA is a bullish stance; cross of price through the average or of a short WMA through a long one are the usual signals. A WMA reacts faster than an SMA so it also whipsaws more.

## Common mistakes and edge cases
- Reversing the weights (oldest heaviest).
- Dividing by n instead of n (n + 1) / 2.
- Confusing with a volume-weighted or exponentially weighted average.
- Early bars before n values exist have no value.

## Open questions
None for the calculation. The ordering convention (newest weight n) is universal in the sources checked.
