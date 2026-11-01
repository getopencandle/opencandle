---
id: dc
name: Donchian channels
kind: indicator
family: channels
sources:
  - title: ChartSchool, Price Channels
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/price-channels
    type: secondary
  - title: Richard Donchian's channel breakout rule
    author: Richard Donchian
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
Draws the highest high and lowest low of the last N bars, with a midpoint, to show breakouts and range extremes.

## How the author meant it to be used
ChartSchool credits Richard Donchian. The upper line is the N-bar high, the lower line is the N-bar low and a dotted centreline is their midpoint. A close above the upper line is an upward thrust that may start an uptrend; below the lower line a downward plunge; in a bigger trend the lines also mark overbought and oversold levels within pullbacks. Donchian's well-known use is breakout trading on a multi-week window, such as the four-week rule.

## How you interact with it
Automatic. Input: length (plus the shared display offset). Value known at bar close. ChartSchool's description of the formula excludes the current bar, so a breakout of the channel is possible. OpenCandle's calculation includes the current bar in the window, which means price can touch but not break its own upper line. For breakouts use Price channel, or set the display offset to 1.

## Calculation
Upper = highest high over N bars, lower = lowest low over N bars, centre = (upper + lower) / 2. ChartSchool: for a 20-day channel on a given day, the window is the 20 days ending the day before; it says a channel break would not be possible if the most recent period were included.

## Standard defaults
20 (ChartSchool and OpenCandle).

## Reading it
A new close beyond the prior-bar channel is the breakout signal (with this tool, compare the close with the previous bar's line, or use offset 1); the midpoint acts as a trend bias and trailing reference.

## Common mistakes and edge cases
- Including or excluding the current bar changes whether a close can break the line; sources differ (see below).
- Using closes rather than highs and lows.
- Confusing the lines with a volatility band; width depends only on range.

## How OpenCandle does it
- Includes the current bar, so price can touch but not break the channel. For breakouts use Price channel, which excludes the current bar, or set the display offset to 1.
- Default length is 20, with a midpoint line.

## Open questions
Sources disagree on window convention: ChartSchool excludes the current bar, while OpenCandle includes it, so a breakout needs the previous bar's value of the upper line. Donchian's own rule excludes the current period, as the four-week breakout rule shows.
