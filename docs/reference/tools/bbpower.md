---
id: bbpower
name: Bull bear power
kind: indicator
family: trend and momentum (Elder-ray)
sources:
  - title: Trading for a Living (Elder-ray introduced); restated in Come Into My Trading Room
    author: Alexander Elder
    year: 1993
    url: book
    type: primary
confidence: medium
---

## Purpose
Elder-ray measures the buying and selling power behind a trend by comparing each bar's high and low with a 13-period exponential average of the close, which Elder treats as the market's consensus of value.

## How the author meant it to be used
As Elder describes it: Bull Power = High minus EMA(13); Bear Power = Low minus EMA(13). The EMA is the trend filter. Elder buys only when the EMA is rising, Bear Power is negative but rising (bears weakening), and he looks for bullish divergence in Bear Power as extra confirmation; he sells short when the EMA is falling, Bull Power is positive but falling, with bearish divergence in Bull Power as confirmation. Bull Power is meant for tops, Bear Power for bottoms, and both are read only in the direction of the EMA slope.

## How you interact with it
Automatic. You set only the length (13). Nothing is placed. In OpenCandle the default display is a single histogram of Bull Power plus Bear Power; the two separate lines exist but are hidden by default. That combined histogram is an OpenCandle presentation choice, not Elder's; Elder-ray proper is two separate series. Values are known at each bar's close (a forming bar changes its high, low and EMA).

## Calculation
EMA(close, N), standard exponential smoothing with factor 2/(N+1). Bull = high - EMA. Bear = low - EMA. Combined histogram = Bull + Bear = high + low - 2 x EMA. A bar's high is at or above its low, so Bull is usually positive and Bear usually negative; sign changes are informative only at extremes.

## Standard defaults
Length 13 (Elder).

## Reading it
Bull Power below zero means even the high failed to reach the average; Bear Power above zero means even the low stayed above it. Elder's rules combine EMA slope, the sign of the opposing power and divergences with price.

## Common mistakes and edge cases
- Treating the combined histogram as Elder's indicator. The signals are defined on the separate series.
- Using Bear Power for buys without checking the EMA slope.
- EMA seeding differs by implementation (first value or SMA seed), so early bars differ.

## How OpenCandle does it
- The default display is one histogram of bull power plus bear power combined (high + low - 2 x EMA). Elder's two separate series exist but are hidden; turn them on in the Style tab.
- The EMA is seeded with a simple average of the first N closes. Default length is 13.

## Open questions
The exact EMA seed Elder used is not documented in sources read. Elder's wording of the divergence rules was not verified against the book text.
