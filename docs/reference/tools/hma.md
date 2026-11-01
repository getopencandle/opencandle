---
id: hma
name: Hull moving average
kind: indicator
family: moving average
sources:
  - title: Hull Moving Average
    author: StockCharts ChartSchool, describing Alan Hull's 2005 method
    year: 2005
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/hull-moving-average-hma
    type: secondary
confidence: medium
---

## Purpose
A smooth moving average with much less lag than a simple or ordinary weighted average.

## How the author meant it to be used
Alan Hull (2005) built it to cut lag while staying smooth. ChartSchool reports he does not recommend crossover systems with it, because crossovers rely on lag differences that the HMA has removed. Use turning points: with the trend up, buy when the HMA turns up; with the trend down, sell short when it turns down. Long HMAs (for example 200) show the overall trend by direction.

## How you interact with it
Automatic overlay. You set length and price source. The value is known at bar close. A turn needs one more bar to confirm, and the open bar's slope can flip before it closes.

## Calculation
WMA1 = WMA(n/2) of price, WMA2 = WMA(n) of price, Raw = 2 x WMA1 - WMA2, HMA = WMA(sqrt(n)) of Raw. ChartSchool rounds n/2 and sqrt(n) to the nearest whole number (n = 11 gives 6 and 3). WMA weights are linear, newest bar heaviest.

## Standard defaults
No fixed default from the author; ChartSchool's ACP default is 20. OpenCandle uses 9.

## Reading it
Slope and turns, plus price relative to the line. Do not use two-HMA crossovers (per Hull).

## Common mistakes and edge cases
- Using EMAs or SMAs instead of WMAs in the base formula.
- Truncating instead of rounding n/2 and sqrt(n); implementations differ. OpenCandle floors both.
- Overshoot after sharp reversals is inherent.
- First values need about n + sqrt(n) bars.

## How OpenCandle does it
- Rounds n/2 and sqrt(n) down, where ChartSchool rounds to the nearest whole number. At the default length 9 this uses a 4-bar average where ChartSchool uses 5.
- Hull Suite rounds sqrt(n) instead, so the two can differ at the same length (length 7 uses 2 here, 3 there).
- Default length is 9.

## Open questions
OpenCandle floors n/2 and sqrt(n), while ChartSchool rounds to the nearest integer; the two differ for some lengths.
