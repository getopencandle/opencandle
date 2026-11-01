---
id: hullsuite
name: Hull Suite
kind: indicator
family: moving average
sources:
  - title: Hull Moving Average
    author: StockCharts ChartSchool, describing Alan Hull's 2005 method
    year: 2005
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/hull-moving-average-hma
    type: secondary
confidence: low
---

## Purpose
A community "suite" built on Alan Hull's moving average: a Hull line (HMA, an exponential variant EHMA, or a triple variant THMA) coloured by whether it is rising, with a band showing the line against its value two bars earlier.

## How the author meant it to be used
The suite itself has no single published author; it is a modern charting-community script. Its core, the Hull moving average, is Alan Hull's (2005). Hull's own advice (via ChartSchool) is to trade turning points of the HMA and not crossovers. The suite applies that: colour changes mark a turn, found by comparing the Hull value with its value two bars ago. The EHMA and THMA variants are common community extensions with no primary source.

## How you interact with it
Automatic overlay. Inputs: price source, length, Hull variation, length multiplier, colour by trend, show as band. The line is known at bar close; the trend flips on the bar where the Hull crosses its value two bars earlier (needs only past bars, no repaint, but the open bar can flip colour before close).

## Calculation
HMA = WMA(2 x WMA(src, n/2) - WMA(src, n), sqrt(n)). EHMA uses EMAs in the same shape. THMA = WMA(3 x WMA(src, n/3) - WMA(src, n/2) - WMA(src, n), n). Rising when Hull[0] > Hull[2], falling otherwise. The band is the fill between Hull and Hull[2]. In OpenCandle the effective length is length x multiplier, truncated; n/2 and n/3 truncate, and sqrt(n) is rounded to the nearest whole number.

## Standard defaults
Length 55, variation HMA, multiplier 1 are the community defaults OpenCandle copied.

## Reading it
Green (rising) or red (falling) Hull line; the band narrows near turns. As with any single moving average, it lags and whipsaws in ranges.

## Common mistakes and edge cases
- Comparing with the previous bar instead of two bars back.
- Mixing rounding rules with ChartSchool's nearest-integer HMA. OpenCandle truncates n/2 here but rounds sqrt(n), whereas the standalone HMA tool floors both n/2 and sqrt(n).
- EMA-based variants depend on seeding.

## How OpenCandle does it
- Length is multiplied by the length multiplier and truncated. n/2 and n/3 are truncated and sqrt(n) is rounded, unlike the standalone Hull moving average, which rounds both down.
- The line counts as rising only when it is above its value two bars earlier; equal counts as falling.
- EHMA uses EMAs seeded with a simple average, so its early values differ from first-value-seeded versions.
- Defaults of length 55, HMA and multiplier 1 are the community script's.

## Open questions
The exact rounding, seeding and two-bar compare of the original script have no primary source.
