---
id: bbpb
name: Bollinger Bands %b
kind: indicator
family: volatility bands
sources:
  - title: Bollinger on Bollinger Bands
    author: John Bollinger
    year: 2001
    url: book
    type: primary
  - title: ChartSchool, %B Indicator
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/b-indicator
    type: secondary
confidence: high
---

## Purpose
Shows where price is relative to the Bollinger Bands as a single number: 0 at the lower band, 1 at the upper band.

## How the author meant it to be used
Bollinger derived %b and BandWidth from the bands (ChartSchool). Levels: below 0 price is under the lower band; 0 at the lower band; 0 to 0.5 between lower and middle; 0.5 to 1 between middle and upper; 1 at the upper band; above 1 above the band. In strong uptrends %b can sit above 1 repeatedly ("walking the band") without being a sell signal; oversold at or below 0 is more useful when the larger trend is up. Bollinger's trend rule with the Money Flow Index: an uptrend begins when %b is above 0.80 and MFI(10) is above 80; a downtrend when %b is below 0.20 and MFI(10) is below 20.

## How you interact with it
Automatic. Inputs: length, multiplier, source. One line in its own pane. Known at the bar's close.

## Calculation
%b = (Price - Lower band) / (Upper band - Lower band). Default (20, 2) matching the bands. Price is the close.

## Standard defaults
20 and 2 on the close.

## Reading it
Above 0.8 near upper band, below 0.2 near lower band. Overbought and oversold readings depend on the larger trend.

## Common mistakes and edge cases
- Dividing by zero when the bands coincide (flat price); the value is undefined.
- Using values from a different setting than the displayed bands.
- Treating >1 as a sell signal in an uptrend.
- Percent versus fraction: ChartSchool uses a fraction (0 to 1), not 0 to 100.

## How OpenCandle does it
- A fraction from 0 to 1 (not 0 to 100), using the population standard deviation like the bands.
- A flat window (upper band equals lower band) or a multiplier of 0 gives no value.
- Defaults are length 20 and 2 standard deviations on the close.

## Open questions
Whether OpenCandle shows the value as a fraction or a percentage; its zero-width band handling.
