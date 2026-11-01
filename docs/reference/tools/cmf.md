---
id: cmf
name: Chaikin money flow
kind: indicator
family: volume
sources:
  - title: ChartSchool, Chaikin Money Flow
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/chaikin-money-flow-cmf
    type: secondary
  - title: Chaikin's original publication (not located; creator named by ChartSchool)
    author: Marc Chaikin
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
Measures buying or selling pressure over a window by weighting each bar's volume by where the close sat inside the bar's range, then dividing by total volume so the result is bounded between -1 and +1.

## How the author meant it to be used
ChartSchool attributes the indicator to Marc Chaikin and says it sums Money Flow Volume over a look-back (typically 20 or 21 days) instead of cumulating it like the Accumulation Distribution Line. A positive value is buying pressure, a negative value selling pressure; the level can confirm or question a trend, and zero-line crosses mark shifts.

## How you interact with it
Automatic. Only the length is set. A bar's value is known at that bar's close; the forming bar's value moves with price and volume.

## Calculation
Multiplier = ((close - low) - (high - close)) / (high - low). Money flow volume = multiplier x volume. CMF(N) = sum of money flow volume over N bars / sum of volume over N bars. OpenCandle: a bar with high equal to low contributes zero money flow, but its volume still counts in the total; a window with zero total volume, or with any missing volume, is unavailable.

## Standard defaults
20 (ChartSchool says 20 or 21). The multiplier is +1 at close = high and -1 at close = low.

## Reading it
ChartSchool: typically between -0.50 and +0.50; reaching +1 needs 20 straight closes at the high. Zero-line crosses can whipsaw when the line only briefly turns barely positive or negative, so ChartSchool treats the absolute level as pressure strength and suggests confirmation.

## Common mistakes and edge cases
- Dividing by N instead of by the volume sum.
- Using close-to-close change instead of close location.
- Zero-range bars (divide by zero) and zero-volume windows.
- It is a ratio, so unit-free, unlike the cumulative line.

## How OpenCandle does it
- A flat bar (high equal to low) adds zero money flow but its volume stays in the denominator.
- A window with zero total volume, or with missing volume anywhere in it, shows no value.
- Default length is 20 (ChartSchool says 20 or 21).

## Open questions
Whether Chaikin himself fixed 20 or 21 as the default is unclear.
