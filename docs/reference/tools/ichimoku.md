---
id: ichimoku
name: Ichimoku cloud
kind: indicator
family: trend / support and resistance
sources:
  - title: Ichimoku Kinko Hyo
    author: Goichi Hosoda
    year: 1969
    url: book
    type: primary
  - title: Ichimoku Cloud
    author: StockCharts ChartSchool
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/ichimoku-cloud
    type: secondary
confidence: medium
---

## Purpose
"One look equilibrium chart": shows trend, support and resistance, and momentum from five lines and a cloud.

## How the author meant it to be used
Hosoda (journalist, 1969 book) built it from midpoints of high-low ranges, which were easier to compute by hand than moving averages. ChartSchool's reading: price above the cloud is an uptrend, below is a downtrend, inside is flat. Cloud colour matters: Span A above Span B (green) strengthens an uptrend; below (red) strengthens a downtrend. The cloud is projected forward so it also marks future support and resistance. Shorter-term signals: Conversion line crossing the Base line, and price crossing the Base line; bullish signals are preferred when price is above a green cloud, bearish below a red one. Lagging span versus price is part of the original system (not detailed in ChartSchool here).

## How you interact with it
Automatic overlay. Inputs: conversion, base and span B lengths, displacement. Nothing to place. The lines are known at bar close. The leading spans are drawn into the future, so the cloud right of the last bar is a projection from known data, not a forecast. The lagging span is the close shifted back, so its newest points are blank until later bars exist.

## Calculation
Conversion (Tenkan) = (highest high + lowest low) / 2 over 9. Base (Kijun) = same over 26. Leading span A (Senkou A) = (Conversion + Base) / 2, plotted 26 periods ahead. Leading span B (Senkou B) = (highest high + lowest low) / 2 over 52, plotted 26 ahead. Lagging span (Chikou) = close plotted 26 periods back.

## Standard defaults
9, 26, 52 and 26 displacement (Hosoda; ChartSchool).

## Reading it
See above. ChartSchool lists four bullish signals (price above cloud, cloud turns green, price above Base, Conversion above Base) and their mirror.

## Common mistakes and edge cases
- Displacement off by one: OpenCandle shifts by displacement minus one (Japanese inclusive counting, the current bar being period 1), so the spans and the lagging span move 25 bars at the default of 26. ChartSchool says "26 periods" and does not discuss inclusion. Sources do not settle whether 25 or 26 bars is meant.
- Using close instead of high/low for the midpoints.
- Treating the cloud as price forecast.
- Needs 52 bars before span B exists; with the shift, the cloud starts later.

## How OpenCandle does it
- Displacement 26 counts the current bar as the first period, so the cloud is drawn 25 bars to the right of the last bar and the lagging span is plotted 25 bars back. A user counting bars sees 25.
- Midpoints use highs and lows, not closes.

## Open questions
Whether the forward shift should be 25 or 26 bars is the main disagreement, and the sources do not settle it.
