---
id: w52hl
name: 52 week high/low
kind: indicator
family: price levels
sources:
  - title: Common charting convention (trailing one-year high and low)
    author: no single author
    year: n/a
    url: n/a
    type: secondary
confidence: medium
---

## Purpose
Draws the highest and lowest prices of the trailing 52 weeks as two lines, to show where price sits within its one-year range.

## How the author meant it to be used
No single author. The 52-week high and low are a long-standing market convention quoted in financial press and exchange data. Traders watch for price approaching or breaking the 52-week high (strength, new-high momentum) or the low (weakness). This is common practice.

## How you interact with it
Automatic. You may choose Source (High/Low or Close) and Lookback weeks. No placement. The value at a bar uses only data up to that bar, so the high line steps up when a new high is made and steps down only when an old extreme ages out of the window.

## Calculation
High line = maximum over the window; low line = minimum over the window. The window is the trailing N calendar weeks (default 52) by time, not a bar count. High/Low uses bar highs and lows; Close uses closes. On intraday charts the older part of the window comes from daily history plus the observed current chart day; the unfinished daily candle from history is excluded so it is not counted twice. Values are unavailable until loaded history reaches the window start.

## Standard defaults
52 weeks, high/low source. A close-only version is common for end-of-day screens.

## Reading it
Price near the high line shows strength; near the low line, weakness. A new 52-week high is the moment the high line moves up with price.

## Common mistakes and edge cases
- Counting 252 or 260 bars instead of 52 calendar weeks (differs around holidays).
- Counting the current day twice on intraday charts.
- Plotting stale or partial values when history is shorter than the window (should be unavailable).
- High/Low and Close sources give different levels.

## How OpenCandle does it
- The window is the trailing number of weeks by time, not a bar count.
- On intraday charts, daily history is used for dates before the current bar's date, and the current day comes from the chart bars. Today's unfinished daily candle is left out, so nothing is counted twice. In Close mode the current day's value is the latest close.
- Daily history may cover regular sessions only while intraday bars include extended hours, so the two sources can mix sessions.

## Open questions
Whether the window is anchored to the current bar's time or the start of the current day, and whether the boundary bar is inclusive, is not settled by any published source.
