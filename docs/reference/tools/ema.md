---
id: ema
name: Exponential Moving Average
kind: indicator
family: moving average
sources:
  - title: ChartSchool, Moving Averages - Simple and Exponential
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-averages-simple-and-exponential
    type: secondary
  - title: Exponential smoothing
    author: Robert G. Brown
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
A moving average that weights recent prices more than old ones, so it follows price with less lag than a simple average.

## How the author meant it to be used
The method is exponential smoothing from statistics and forecasting (commonly credited to Brown in the 1950s, though the attribution is uncertain); there is no single technical-analysis author. ChartSchool: an EMA reduces lag by applying more weight to recent prices; the weighting depends on the number of periods; it reacts faster than the SMA and is used for trend direction, support/resistance and crossovers. As the basis of MACD and PPO it is also a building block.

## How you interact with it
Automatic. Inputs: length, source, and the shared smoothing and offset options. Value known at bar close; the forming bar revises it. Each EMA value depends on the entire prior history (infinite memory), so early bars differ depending on how much history is loaded and how the seed is chosen.

## Calculation
Multiplier = 2 / (N + 1). EMA = (price - previous EMA) x multiplier + previous EMA. ChartSchool's three steps: the first EMA is the SMA of the first N values as the starting point (SMA-seed), then the multiplier, then the recursion. ChartSchool shows 10 periods giving 18.18 percent. Some tools seed with the first price instead.

## Standard defaults
Commonly 9, 12, 20, 26, 50 and 200. OpenCandle defaults to length 9 on the close, with an SMA seed.

## Reading it
Price above a rising EMA indicates uptrend bias. Crossovers of price or two EMAs are signals that lag and whipsaw in ranges.

## Common mistakes and edge cases
- Seeding with the first price versus an SMA gives different early values.
- Confusing the multiplier 2/(N+1) with Wilder's 1/N smoothing, which is used for RSI and ATR.
- Needing roughly 3N bars of history before the seed effect is negligible.
- Dividend or split adjustment changes values.

## How OpenCandle does it
- Default length is 9, on the close.
- The first value is the simple average of the first N prices, then the 2 / (N + 1) recursion.

## Open questions
The Brown attribution is uncertain.
