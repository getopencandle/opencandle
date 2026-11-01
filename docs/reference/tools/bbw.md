---
id: bbw
name: Bollinger BandWidth
kind: indicator
family: volatility bands
sources:
  - title: Bollinger on Bollinger Bands
    author: John Bollinger
    year: 2001
    url: book
    type: primary
  - title: ChartSchool, Bollinger BandWidth
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/bollinger-bandwidth
    type: secondary
confidence: high
---

## Purpose
Measures the width of the Bollinger Bands relative to the middle band, so volatility can be compared across time and across instruments.

## How the author meant it to be used
ChartSchool: Bollinger names BandWidth as one of two indicators derived from the bands (the other is %b). It falls when the bands narrow and rises when they widen. Its best-known use is the Squeeze: when BandWidth reaches a low relative to its own history, volatility is compressed and often followed by expansion. Narrowness is relative; judge against an 8 to 12 month history of the same security (the example uses a reading below 10, meaning bands narrower than 10 percent of the middle band, for one stock). BandWidth tells nothing about direction.

## How you interact with it
Automatic. Inputs: length, multiplier, source. One line in its own pane. Known at the bar's close.

## Calculation
BandWidth = (Upper band - Lower band) / Middle band x 100. With the usual (20, 2) settings this is 4 x standard deviation / SMA x 100. OpenCandle leaves out the x 100 and shows the plain ratio, so 0.10 here is a reading of 10 on ChartSchool.

## Standard defaults
20 and 2 on the close. The squeeze threshold is chosen per instrument.

## Reading it
Low BandWidth: squeeze, potential breakout in either direction. High: volatility expanded, often near the end of a move. Use the six-month low of BandWidth, not a fixed value.

## Common mistakes and edge cases
- Forgetting to divide by the middle band (the result then scales with price).
- Treating a low value as a directional signal.
- Applying a fixed squeeze threshold across instruments.
- Zero middle band must be unavailable, not infinite.

## How OpenCandle does it
- Shown as a fraction, not multiplied by 100: 0.10 means 10 on ChartSchool's scale.
- Uses the population standard deviation. A flat window gives 0, and a zero middle band gives no value.
- Defaults are length 20 and 2 standard deviations on the close.

## Open questions
Whether OpenCandle reports a percentage (x 100) or a fraction.
