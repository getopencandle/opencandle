---
id: mom
name: Momentum
kind: indicator
family: momentum oscillator
sources:
  - title: TA-Lib MOM, ta_MOM.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_MOM.c
    type: secondary
confidence: medium
---

## Purpose
Measures the difference between the current price and the price n bars ago.

## How the author meant it to be used
No single author; it is among the oldest technical measures. It is the plain price difference form (the ratio form is Rate of Change, ROC). Positive means price is above where it was n bars ago, negative below. Use zero-line crossings for direction, slope for acceleration, and divergences with price.

## How you interact with it
Automatic, in its own pane. Inputs: length and source. Known at bar close; no repaint on closed bars.

## Calculation
MOM(t) = price(t) - price(t - n). TA-Lib confirms this (output equals the input minus the input n bars back; default 10, valid range 1 to 100000).

## Standard defaults
10 (TA-Lib and OpenCandle).

## Reading it
Above zero is bullish momentum, below zero bearish. The scale depends on price level, so it is not comparable across instruments; use ROC for that.

## Common mistakes and edge cases
- Confusing it with ROC (percent) or with the momentum ratio (price / price[n] x 100).
- First n bars have no value.
- Gaps and outliers in the n-bars-ago price cause "drop-off" jumps.

## Open questions
Some books define momentum as the ratio times 100; OpenCandle uses the price difference.
