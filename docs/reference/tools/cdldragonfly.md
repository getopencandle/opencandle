---
id: cdldragonfly
name: Dragonfly Doji (bullish)
kind: pattern
family: doji with a long shadow
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991 (2nd ed. 2001)
    url: book
    type: primary
  - title: Candlestick Pattern Dictionary (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary
    type: secondary
  - title: Candlestick Bullish Reversal Patterns (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bullish-reversal-patterns
    type: secondary
  - title: Encyclopedia of Candlestick Charts
    author: Thomas N. Bulkowski
    year: 2008
    url: book
    type: secondary
confidence: medium
---

## Purpose
A one-bar bullish signal: open, high and close all near the same level, with a long lower shadow.

## How the author meant it to be used
Nison: the dragonfly doji (a 'T' shape) has open, high and close at or very near the same level and a long lower shadow. It matters most at a bottom, where sellers pushed prices down and buyers drove them all the way back; he also notes it can be a top signal in some contexts, and that its significance grows with the preceding trend and confirmation. ChartSchool: a doji whose open and close are at the high of the day, normally appearing at turning points. The Nison description is paraphrased from his book.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag. Add it from the Patterns tab of the Indicators dialog; the indicator scans every bar and puts a labelled marker on the bar that COMPLETES the pattern (the last bar of the formation), and sets its 0/1 signal plot to 1 on that bar. Inputs: 'Detect trend based on' (SMA50, 'SMA50, SMA200', or No detection) and, where the family has both directions, 'Pattern type' (Bullish, Bearish or Both). Trend rule SMA50: uptrend means the close is above its 50-bar average, downtrend below. 'SMA50, SMA200' additionally needs the 50 above (or below) the 200. No detection accepts every bar. The signal is known only when the completing bar has closed: on a live bar the marker can appear or vanish until the bar closes, but once the bar is closed it never moves or repaints, and no later bar is read. Nison and ChartSchool both say most candlestick patterns want follow-through (a gap, a long candle in the new direction, or heavy volume) within the next one to three bars; the indicator does NOT wait for that, it reports at completion, so confirmation is the reader's job. The trend context is read on the bar BEFORE the pattern's first bar, so the trend test never uses the pattern's own bars.

## Calculation
One bar: a doji (body at most 5% of range) whose upper shadow is at most 10% of the range, so the body sits at the top of the range. Signal on that bar. Trend gate: a downtrend on the previous bar. The lower shadow length is not tested directly, but the body (at most 5%) and the upper shadow (at most 10%) together leave the lower shadow at least 85% of the bar's range; only a size test against recent bars is missing.

## Standard defaults
OpenCandle's numeric thresholds (its own choice, not from the sources): doji body at most 5% of the bar's range; a small shadow at most 10% of the range; a 'long' body is larger than the mean body of the previous 14 bars and a 'small' body is at most half of that mean. Bars with a missing price or zero range never take part, and the first 14 bars cannot report patterns that need a long or small body. Nison gives no numeric thresholds; he describes shapes, so any percentage is an implementation choice.

## Reading it
A bullish reversal alert after a decline. Confirm with a higher close on the next bar.

## Common mistakes and edge cases
- A dragonfly with a tiny range is common and meaningless; look for a long lower shadow relative to recent bars (OpenCandle does not compare the bar's size with recent bars).
- Without the downtrend gate the same shape at a top is not bullish (it can precede a drop).
- Only 'doji with almost no upper shadow' is tested.

## How OpenCandle does it
- A doji (body at most 5% of the range) whose upper shadow is at most 10% of the range, which leaves the lower shadow at least 85% of the bar's own range.
- There is no floor relative to recent bars. TA-Lib also wants the lower shadow longer than 10% of the 10-bar average range, so OpenCandle accepts tiny-range dragonflies.

## Open questions
- Whether a minimum bar size relative to recent bars should also be required.
