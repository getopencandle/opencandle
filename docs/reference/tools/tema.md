---
id: tema
name: Triple EMA
kind: indicator
family: moving average
sources:
  - title: Technical Analysis of Stocks and Commodities, DEMA/TEMA articles
    author: Patrick G. Mulloy
    year: 1994
    url: book
    type: primary
  - title: ChartSchool, Triple Exponential Moving Average
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/triple-exponential-moving-average-tema
    type: secondary
  - title: TA-Lib TEMA source, ta_TEMA.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_TEMA.c
    type: secondary
confidence: high
---

## Purpose
A lag-reduced moving average built from three chained EMAs. It is not simply an EMA of an EMA of an EMA; the weighted combination cancels much of the lag.

## How the author meant it to be used
Patrick Mulloy created DEMA and then TEMA in 1994 (per ChartSchool). The aim is a faster average for short-term trading. ChartSchool: the most common signal is price crossing TEMA, or a shorter TEMA crossing a longer one, and these crossovers occur earlier than with EMAs or DEMAs. Because it reacts faster it also whipsaws more, so strategies need adjusting.

## How you interact with it
Automatic overlay. Set length and source. Nothing is placed; each value uses current and earlier bars only. Early values are blank because three EMA stages must warm up.

## Calculation
EMA1 = EMA(price, N); EMA2 = EMA(EMA1, N); EMA3 = EMA(EMA2, N); TEMA = 3 x EMA1 - 3 x EMA2 + EMA3 (ChartSchool and TA-Lib agree). Alpha = 2/(N+1). TA-Lib seeds each EMA with an SMA, so the first TEMA value is at zero-based index 3 x (N - 1).

## Standard defaults
ChartSchool's overlay default is 20 periods. OpenCandle uses 9. Other values are user choices.

## Reading it
Price above a rising TEMA is bullish. Crossovers come sooner than with an EMA, at the cost of more noise. It can overshoot at sharp turns because of the negative-weighted term.

## Common mistakes and edge cases
- Using different lengths for the three stages; all use the same N.
- Different EMA seeding (first price versus SMA) changes the early bars.
- Missing inputs should make the result unavailable, not zero.

## How OpenCandle does it
- Each EMA is seeded with a simple average, so the first value comes at bar 3 x (N - 1) + 1 and early bars are blank.
- Default length is 9 (ChartSchool's overlay uses 20).

## Open questions

