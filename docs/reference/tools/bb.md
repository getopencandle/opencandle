---
id: bb
name: Bollinger Bands
kind: indicator
family: volatility bands
sources:
  - title: Bollinger on Bollinger Bands
    author: John Bollinger
    year: 2001
    url: book
    type: primary
  - title: ChartSchool, Bollinger Bands
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/bollinger-bands
    type: secondary
  - title: TA-Lib BBANDS source, ta_BBANDS.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_BBANDS.c
    type: secondary
confidence: high
---

## Purpose
Volatility bands placed above and below a moving average. They widen when volatility increases and narrow when it falls, so price is judged relatively high or low.

## How the author meant it to be used
Per ChartSchool, Bollinger bands are not signals by themselves: touches are "tags", not buy or sell signals. They confirm patterns: W-bottoms (second low lower than the first but holding above the lower band) and M-tops (a new high that fails to reach the upper band after a reaction high above it, a non-confirmation). In strong trends price "walks the band". By Bollinger the bands should contain about 88 to 89 percent of price action. Bollinger recommends small steps when changing the multiplier, and changing the length requires a matching move in the multiplier.

## How you interact with it
Automatic. Inputs: length, multiplier, source (and offset). Draws middle, upper and lower lines. Known at the bar's close; while a bar is forming, the bands move with it.

## Calculation
Middle = SMA(N). Upper = Middle + k x standard deviation of the same N prices. Lower = Middle - k x the same. A simple average is used because the standard deviation formula is built on it, and the deviation uses the same look-back. The deviation is the population form (divide by N) in Bollinger's convention; OpenCandle does the same.

## Standard defaults
20 periods, 2 standard deviations, close. Bollinger suggests 10 periods with 1.9 and 50 periods with 2.1 for shorter and longer settings.

## Reading it
Squeeze (narrow bands) often precedes a larger move; bands tight is read on BandWidth. %b locates price within the bands.

## Common mistakes and edge cases
- Using the sample deviation (N - 1) or an exponential middle band without saying so.
- Different look-back for the average and the deviation.
- Treating a band touch as a reversal signal.
- Source other than close changes the bands.

## How OpenCandle does it
- The middle line is a simple average and the deviation is the population form (divide by N) over the same window.
- The basis average type option moves only the middle line; the band width still comes from the standard deviation.
- Defaults are 20 periods and 2 standard deviations on the close.

## Open questions
Exact formula for the population-versus-sample choice in TA-Lib versus OpenCandle was not verified from the source beyond the header.
