---
id: smma
name: Smoothed moving average
kind: indicator
family: moving average
sources:
  - title: New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: primary
  - title: ChartSchool, Relative Strength Index (smoothing method)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-strength-index-rsi
    type: secondary
confidence: medium
---

## Purpose
A slow exponential-style average with long memory, equal to the smoothing Wilder used inside RSI, ATR and ADX. Also called RMA or Wilder's moving average.

## How the author meant it to be used
Wilder did not present it as a stand-alone overlay; he used the recurrence to smooth the averages in RSI, ATR and the directional indicators (period 14 is his usual choice). As an overlay it is used like any moving average: trend side and slope, crossovers, dynamic support. It is slower than an EMA of the same length because its effective alpha is 1/N rather than 2/(N+1).

## How you interact with it
Automatic overlay. Set length and source. No placement; values use only the current and earlier bars and never repaint. Because the recurrence has long memory, early values depend on the seeding method.

## Calculation
Seed: SMA of the first N values. Then SMMA(t) = (SMMA(t-1) x (N - 1) + x(t)) / N. This is an EMA with alpha = 1/N. Wilder's own RSI example multiplies the previous average by 13, adds the new value and divides by 14.

## Standard defaults
Wilder's 14 inside his indicators. As an overlay many tools use 7 or 9 (OpenCandle uses 7 for new instances and keeps 9 for legacy saved ones).

## Reading it
Same as other moving averages, with fewer whipsaws and more lag. An SMMA(N) tracks roughly an EMA(2N-1).

## Common mistakes and edge cases
- Using alpha 2/(N+1) (that is a plain EMA).
- Starting from the first price instead of the SMA seed gives different early values that converge slowly.
- Source defaults differ between tools; a mismatch looks like a formula error.

## How OpenCandle does it
- Uses Wilder smoothing (RMA, alpha 1/N) seeded with a simple average of the first N values.
- Default length is 7 for new indicators (Wilder used 14 inside his indicators). Charts saved earlier keep their stored length, which was 9.

## Open questions
Some public descriptions word the recurrence ambiguously; the form above matches Wilder's worked example. Confidence is medium because
