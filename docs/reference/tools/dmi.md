---
id: dmi
name: Directional movement index
kind: indicator
family: trend strength
sources:
  - title: New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: primary
  - title: ChartSchool, Average Directional Index
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-directional-index-adx
    type: secondary
confidence: high
---

## Purpose
Wilder's Directional Movement System: +DI and -DI show trend direction, ADX shows trend strength regardless of direction.

## How the author meant it to be used
ChartSchool, summarising Wilder: +DI above -DI means the trend is up, below means down. A strong trend is present when ADX is above 25 and no trend when it is below 20; many traders use 20 as the qualifying level instead. Wilder's simple system: with ADX above 25, buy when +DI crosses above -DI, using the low of the crossing day as the stop (sell on the mirror cross). ChartSchool stresses that Wilder was a commodity and currency trader. ADX rising means the trend strengthens, in either direction.

## How you interact with it
Automatic. OpenCandle inputs: DI length (14) and ADX smoothing (14); the ADX smoothing applies only to the DX series. Values known at bar close. Smoothing needs many bars before values settle; ChartSchool says around 150 periods for true ADX values.

## Calculation
Per bar: up move = high - prior high; down move = prior low - low. +DM = up move if it exceeds down move and is positive, else 0; -DM = down move if it exceeds up move and is positive, else 0 (an inside bar gives zero for both). True range as for ATR. Smooth +DM, -DM and TR with Wilder smoothing over N: first value is the sum of the first N values; then new = previous - previous/N + current. +DI = 100 x smoothed +DM / smoothed TR; -DI likewise. DX = 100 x |+DI - -DI| / (+DI + -DI). First ADX is the mean of the first N DX values; after that ADX = (previous ADX x (N-1) + DX) / N.

## Standard defaults
14 (Wilder).

## Reading it
ADX above 25 trending, below 20 range. A rising ADX with the DI cross confirms direction. A peak in ADX followed by a fall shows the trend losing strength, not reversing.

## Common mistakes and edge cases
- Treating ADX as directional; it is not.
- Using simple moving averages in place of Wilder smoothing.
- Mixing up the DM rule when both moves are equal or negative (both zero).
- Wilder's first ADX uses an average of N DX values, so the first ADX needs about 2N bars.

## How OpenCandle does it
- Wilder smoothing is seeded with an average of the first N values rather than their sum; the DI ratios come out identical.
- The ADX smoothing input smooths only the DX series. The first ADX is the average of the first N DX values.
- An inside bar gives zero for both +DM and -DM.

## Open questions
Wilder's stop rule (the extreme point rule) is covered under DI cross signals.
