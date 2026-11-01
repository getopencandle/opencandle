---
id: mtfcandles
name: Multi-time period charts
kind: indicator
family: multi-timeframe
sources:
  - title: Higher-timeframe candle overlay (common charting convention; no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
Draws candles of a higher interval (for example daily) over a lower-interval chart, so both timeframes are visible together.

## How the author meant it to be used
No author or primary source; a charting convenience. The point is to see the larger bar's open, high, low and close against the finer bars that built it, for context (the day's range while viewing 15-minute bars).

## How you interact with it
Automatic. You pick the higher interval and how many candles to show. Nothing is placed. Key rule: the newest higher candle is still forming. On each chart bar the higher candle should show only open, high, low and close so far (open of the first bar in the bucket, running high and low, close of the current bar). Showing a bucket's final high, low and close on its early bars leaks the future. A finished higher candle never changes afterwards.

## Calculation
Bucket chart bars by the higher interval (calendar buckets; weeks start Monday; the day boundary depends on session convention, UTC in OpenCandle). Higher open = first open in bucket; high = max high so far; low = min low so far; close = latest close. Up if close >= open.

## Standard defaults
OpenCandle: interval 1D, newest 200 candles (OpenCandle-chosen).

## Reading it
Compare the forming higher candle with its prior candles: where the close sits in the range, and whether lower-timeframe moves stay inside the higher range.

## Common mistakes and edge cases
- Look-ahead: drawing a bucket's full range before the bucket ends.
- Session anchoring: US equity sessions are not UTC midnight; ignoring the session splits one session across two candles.
- An interval lower than the chart's is meaningless.
- A missing price in a bucket should not silently become zero.

## How OpenCandle does it
- Buckets are aligned to UTC, not to exchange sessions. For US stocks, after-hours bars in winter (19:00 to 20:00 New York) fall into the next UTC day, and 240-minute buckets are UTC-aligned too.
- The newest higher candle shows only what is known so far (running high and low, current close); a finished higher candle never changes.
- Default is the 1D interval with the newest 200 candles.

## Open questions
Session-aware bucketing is not implemented in OpenCandle; correct behaviour for sessions that cross midnight.
