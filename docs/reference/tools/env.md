---
id: env
name: Envelope
kind: indicator
family: channels
sources:
  - title: ChartSchool, Moving Average Envelopes
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-average-envelopes
    type: secondary
  - title: Percentage envelope (common charting practice; no single author located)
    author: unknown
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
Parallel bands a fixed percentage above and below a moving average, as a trend guide and, in flat markets, an overbought/oversold gauge.

## How the author meant it to be used
No single author. ChartSchool: the base can be a simple or an exponential moving average, and each envelope is set the same percentage above or below it, giving parallel bands. The bands are a trend-following tool; in a flat trend, touches of the outer band can mark overbought or oversold. Traders tend to use shorter averages and tight envelopes; investors longer averages and wider ones. Unlike Bollinger Bands or Keltner Channels, the width does not adapt to volatility, so the chartist must tune the percentage by instrument.

## How you interact with it
Automatic. Inputs: length, percent, source, exponential on or off. Value known at bar close.

## Calculation
Basis = SMA or EMA of the source over N. Upper = basis x (1 + p/100). Lower = basis x (1 - p/100). ChartSchool's example: 20-day SMA with a 2.5 percent envelope, upper = SMA + SMA x 0.025.

## Standard defaults
OpenCandle: length 20, percent 10, SMA. ChartSchool's illustrative example: 20 and 2.5 percent. The percentage is instrument-dependent.

## Reading it
Close outside a band in a trending market means strength, not a reversal; in a range it signals a possible fade. The distance is proportional to price, so bands widen in dollars as price rises.

## Common mistakes and edge cases
- Percentages applied to the average, not to price.
- Treating bands as volatility-adaptive.
- Log-scale charts: the bands are a constant percentage, which are parallel on a log axis only after the basis is shown on that axis.

## How OpenCandle does it
- The percentage is applied to the average, not to price. Default is a 20-bar simple average with 10 percent bands (ChartSchool's example uses 2.5 percent).

## Open questions
The right percentage default has no authoritative value.
