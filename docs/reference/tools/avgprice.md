---
id: avgprice
name: Average price
kind: indicator
family: price transform
sources:
  - title: TA-Lib AVGPRICE source, ta_AVGPRICE.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_AVGPRICE.c
    type: secondary
confidence: medium
---

## Purpose
Plots the mean of each bar's open, high, low and close as a single smoothed price line.

## How the author meant it to be used
No single author. It is a standard price transform (alongside median price, typical price and weighted close) used as an input to other indicators or as a quick measure of the bar's central price. TA-Lib defines it as (High + Low + Close + Open) / 4.

## How you interact with it
Automatic. No inputs. Overlay on the price chart. The value is final at the bar's close (before the close it moves with the developing bar).

## Calculation
Average price = (Open + High + Low + Close) / 4, per bar. No lookback.

## Standard defaults
None.

## Reading it
It is less noisy than the close. It lies inside the bar. It is not a moving average and has no memory of previous bars.

## Common mistakes and edge cases
- Confusing with typical price (H + L + C) / 3 or median price (H + L) / 2.
- Averaging over a period; that is a moving average of this transform.
- Bars with a missing component should give no value.

## How OpenCandle does it
- A bar missing any of its four prices shows no value.

## Open questions
None beyond how OpenCandle treats bars with a missing open (for example instruments that provide only closes).
