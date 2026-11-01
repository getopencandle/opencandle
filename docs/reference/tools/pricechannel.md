---
id: pricechannel
name: Price channel
kind: indicator
family: channels / breakout
sources:
  - title: ChartSchool, Price Channels
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/price-channels
    type: secondary
  - title: Donchian channel / four-week rule
    author: Richard Donchian
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
The highest high and lowest low of the last N periods, with their midpoint, to identify breakouts and extremes.

## How the author meant it to be used
ChartSchool credits Richard Donchian (the indicator is also called Donchian Channels). A close or high above the upper line shows extraordinary strength and can signal the start of an uptrend; a plunge below the lower line signals a downtrend. Inside a larger trend, a dip below the lower line in an uptrend marks an oversold pullback. Channel breaks whipsaw; a close-only line chart filters some. Longer timeframes matter more (a 20-week high more than a 20-day high). The centerline is touched more often than the outer lines.

## How you interact with it
Automatic. You set the length; OpenCandle also offers a display offset. The channel at a bar uses only earlier bars, so it is known before the bar opens and does not repaint.

## Calculation
ChartSchool: upper = N-period high, lower = N-period low, center = (upper + lower)/2, and the window excludes the current period, since otherwise a break above the channel could never happen. The channel for October 21 uses the 20 days ending October 20. Some Donchian implementations include the current bar; then price can only touch, never exceed, the line.

## Standard defaults
20 periods (ChartSchool).

## Reading it
Breakout above upper = strength; below lower = weakness; center line as a trend bias. Strong trends keep price on or beyond the outer line while the line itself keeps moving.

## Common mistakes and edge cases
- Including the current bar in the window.
- Using closes for the lines (the standard uses highs and lows).
- Off-by-one on window length (N bars before the current bar).
- Warm-up: no value until N prior bars exist.

## How OpenCandle does it
- The window excludes the current bar, as in ChartSchool, so price can break above or below the channel. The Donchian channel tool includes the current bar, so price can only touch it.
- Default length is 20.
- A negative display offset shifts the lines onto earlier bars, which shows information from the future; use zero or a forward offset.

## Open questions
Only forward display offsets are safe from look-ahead.
