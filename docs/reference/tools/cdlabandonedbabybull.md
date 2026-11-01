---
id: cdlabandonedbabybull
name: Abandoned baby (bullish)
kind: pattern
family: abandoned baby
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
Marks a three-bar island-style reversal where a doji is cut off from its neighbours by gaps on both sides.

## How the author meant it to be used
Nison presents the abandoned baby as a rare and powerful top or bottom reversal: a doji (the 'baby') stranded alone by a shadow-to-shadow gap on both sides. At a bottom, a long black candle is followed by a gap-down doji, then a gap-up white candle. ChartSchool describes the bearish mirror and says the pattern needs no further confirmation, because the second gap and long candle already show sustained pressure. The Nison description is paraphrased from his book.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag. Add it from the Patterns tab of the Indicators dialog; the indicator scans every bar and puts a labelled marker on the bar that COMPLETES the pattern (the last bar of the formation), and sets its 0/1 signal plot to 1 on that bar. Inputs: 'Detect trend based on' (SMA50, 'SMA50, SMA200', or No detection) and, where the family has both directions, 'Pattern type' (Bullish, Bearish or Both). Trend rule SMA50: uptrend means the close is above its 50-bar average, downtrend below. 'SMA50, SMA200' additionally needs the 50 above (or below) the 200. No detection accepts every bar. The signal is known only when the completing bar has closed: on a live bar the marker can appear or vanish until the bar closes, but once the bar is closed it never moves or repaints, and no later bar is read. Nison and ChartSchool both say most candlestick patterns want follow-through (a gap, a long candle in the new direction, or heavy volume) within the next one to three bars; the indicator does NOT wait for that, it reports at completion, so confirmation is the reader's job. The trend context is read on the bar BEFORE the pattern's first bar, so the trend test never uses the pattern's own bars.

## Calculation
Three bars. Bar 1 black and long. Bar 2 a doji (body at most 5% of its range) whose HIGH is below bar 1's LOW (a gap down that leaves the doji's whole range isolated). Bar 3 white and not small, with its LOW above bar 2's HIGH (gap up with no shadow overlap), closing at least 30% of the way up bar 1's body. The signal is on bar 3. The prior-trend test (downtrend) is applied to the bar before bar 1.

## Standard defaults
OpenCandle's numeric thresholds (its own choice, not from the sources): doji body at most 5% of the bar's range; a small shadow at most 10% of the range; a 'long' body is larger than the mean body of the previous 14 bars and a 'small' body is at most half of that mean. Bars with a missing price or zero range never take part, and the first 14 bars cannot report patterns that need a long or small body. Nison gives no numeric thresholds; he describes shapes, so any percentage is an implementation choice.

## Reading it
A bullish reversal signal after a decline. The two gaps (down then up) are the whole point: the isolated doji marks a decisive change of hands. ChartSchool notes that in practice the middle candle may be a very small body rather than a perfect doji (its bearish example used a small white body).

## Common mistakes and edge cases
- Gaps are rare on continuous markets (FX, crypto, 24h futures) and on most intraday charts, so the pattern may almost never fire there.
- Shadow-to-shadow gap, not body-to-body: a doji whose shadow touches a neighbour's shadow is NOT an abandoned baby (it may be a doji star or morning/evening doji star).
- Sources describe long first and third candles; OpenCandle requires a long first body and a third body that is not small.

## How OpenCandle does it
- Needs a long first body (larger than the mean body of the previous 14 bars) and a third body that is not small (more than half that mean). A tiny first or third bar does not qualify.
- The third bar must close at least 30% of the way into the first bar's body.
- The gaps are strict and shadow to shadow: the doji's whole range must clear both neighbours, with no overlap.
- The doji body is at most 5% of its own range. The trend is read on the bar before the first bar, and the signal is reported when the third bar closes, without waiting for confirmation.

## Open questions
- Real gaps are strict in OpenCandle (high below low); sources do not discuss tolerance.
