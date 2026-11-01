---
id: dema
name: Double EMA
kind: indicator
family: moving average
sources:
  - title: Technical Analysis of Stocks & Commodities, January 1994
    author: Patrick Mulloy
    year: 1994
    url: book
    type: primary
  - title: ChartSchool, Double Exponential Moving Average
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/double-exponential-moving-average-dema
    type: secondary
  - title: TA-Lib DEMA source, ta_DEMA.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_DEMA.c
    type: secondary
confidence: high
---

## Purpose
A moving average with less lag than an ordinary EMA, that still stays smooth.

## How the author meant it to be used
ChartSchool: Mulloy introduced it in Technical Analysis of Stocks & Commodities in January 1994. DEMA uses the lag difference between a single-smoothed EMA and a double-smoothed EMA to offset the single EMA, so it hugs price more closely. It is read like any EMA: price crossing it, or a shorter DEMA crossing a longer one (20 over 50 bullish), but the signals come sooner than with an EMA. The cost is more sensitivity and more whipsaw.

## How you interact with it
Automatic. Inputs: length and source. Value known at bar close; the forming bar revises it. Needs roughly twice the length of data before the first value (two nested EMAs).

## Calculation
EMA1 = EMA(price, N). EMA2 = EMA(EMA1, N). DEMA = 2 x EMA1 - EMA2. The EMA uses factor 2/(N+1); seed conventions (SMA seed or first value) change early bars. TA-Lib computes the same quantity with SMA-seeded nested EMAs, so its first value is at index 2(N-1).

## Standard defaults
OpenCandle: 9. Common uses: 20 and 50 (ChartSchool example). TA-Lib: 30.

## Reading it
Above or below price like an EMA; the slope shows trend. A crossover of price through DEMA comes earlier but less reliably than for an EMA.

## Common mistakes and edge cases
- Treating DEMA as an average of two EMAs; it is twice one EMA minus the second.
- Overshoot after sharp reversals is expected, not a bug.
- Computing EMA2 on price instead of on EMA1.
- Early-bar values depend on the seed, so compare only after warm-up.

## How OpenCandle does it
- Both EMAs are seeded with a simple average, so the first value appears at bar 2 x (N - 1) + 1, as in TA-Lib.
- Default length is 9 (TA-Lib uses 30).

## Open questions

