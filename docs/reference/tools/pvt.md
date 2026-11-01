---
id: pvt
name: Price volume trend
kind: indicator
family: volume
sources:
  - title: Price Volume Trend (cumulative volume weighted by percent price change; originator not identified)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
  - title: ChartSchool, On Balance Volume
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/on-balance-volume-obv
    type: secondary
confidence: low
---

## Purpose
A cumulative volume line like OBV, but each bar's volume is scaled by how much the price moved, so a 3 percent move counts far more than a 0.1 percent one.

## How the author meant it to be used
No single author is firmly credited. The common description is that PVT improves on OBV, which adds the full volume for any up close regardless of size. Use is the same as OBV: trend confirmation, divergences with price, breaks of its own support and resistance. The absolute level is meaningless.

## How you interact with it
Automatic, no inputs, needs volume. Known at the bar close; a finished bar never changes.

## Calculation
PVT(t) = PVT(t-1) + volume(t) x (close(t) - close(t-1)) / close(t-1). The starting value is arbitrary (zero is common) and only shifts the line. The first bar has no prior close.

## Standard defaults
None.

## Reading it
Rising PVT with rising price confirms the trend; PVT falling while price rises is a bearish divergence; the reverse bullish. Compare shape, not level.

## Common mistakes and edge cases
- Using the absolute price change instead of the percent change.
- Resetting the total at the start of each session (the line is meant to run continuously).
- Zero prior close.
- The starting value and history length change the level; compare the same history.

## How OpenCandle does it
- The first bar is empty. If the previous close is zero, that bar gets no value and the running total carries on.

## Open questions
The original source and starting value are not settled; the starting value only shifts the line.
