---
id: cdldarkcloud
name: Dark cloud cover (bearish)
kind: pattern
family: piercing / dark cloud
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
  - title: Candlestick Bearish Reversal Patterns (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bearish-reversal-patterns
    type: secondary
  - title: Encyclopedia of Candlestick Charts
    author: Thomas N. Bulkowski
    year: 2008
    url: book
    type: secondary
confidence: medium
---

## Purpose
A two-bar bearish reversal: after a long white candle, a black candle opens above and closes deep inside the white body.

## How the author meant it to be used
Nison's rule set: a definable uptrend; a long white candle; then a black candle that opens ABOVE the prior session's high (a new high) and closes within the white body, preferably below its midpoint. Nison treats a close below the midpoint as the line between a pattern worth acting on and one that needs confirmation, and says deeper penetration is better. ChartSchool says the black candle must open above the previous CLOSE and close below the midpoint of the white body, and that both candles should be fairly large with small shadows. A close above the midpoint might qualify as a reversal but is not considered bearish. The two sources therefore differ on the open: above the high (Nison) vs above the close (ChartSchool). The Nison description is paraphrased from his book.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag. Add it from the Patterns tab of the Indicators dialog; the indicator scans every bar and puts a labelled marker on the bar that COMPLETES the pattern (the last bar of the formation), and sets its 0/1 signal plot to 1 on that bar. Inputs: 'Detect trend based on' (SMA50, 'SMA50, SMA200', or No detection) and, where the family has both directions, 'Pattern type' (Bullish, Bearish or Both). Trend rule SMA50: uptrend means the close is above its 50-bar average, downtrend below. 'SMA50, SMA200' additionally needs the 50 above (or below) the 200. No detection accepts every bar. The signal is known only when the completing bar has closed: on a live bar the marker can appear or vanish until the bar closes, but once the bar is closed it never moves or repaints, and no later bar is read. Nison and ChartSchool both say most candlestick patterns want follow-through (a gap, a long candle in the new direction, or heavy volume) within the next one to three bars; the indicator does NOT wait for that, it reports at completion, so confirmation is the reader's job. The trend context is read on the bar BEFORE the pattern's first bar, so the trend test never uses the pattern's own bars.

## Calculation
Two bars. Bar 1 white and long. Bar 2 black, opens above bar 1's HIGH (OpenCandle follows the stricter reading), and closes above bar 1's open but below its midpoint. Signal on bar 2. Trend context: an uptrend on the bar before bar 1.

## Standard defaults
OpenCandle's numeric thresholds (its own choice, not from the sources): doji body at most 5% of the bar's range; a small shadow at most 10% of the range; a 'long' body is larger than the mean body of the previous 14 bars and a 'small' body is at most half of that mean. Bars with a missing price or zero range never take part, and the first 14 bars cannot report patterns that need a long or small body. Nison gives no numeric thresholds; he describes shapes, so any percentage is an implementation choice.

## Reading it
Bearish reversal warning after an advance. ChartSchool: further weakness (gap down, long black candle, heavy volume) is required for confirmation within one to three bars. It is a resistance clue even when unconfirmed.

## Common mistakes and edge cases
- Opening above the prior HIGH is a harder test than above the prior close; on intraday and continuous markets the open often equals the previous close, so the pattern rarely fires.
- Closing below bar 1's open turns it into an engulfing pattern (a separate family).
- In a downtrend the same shape is only a continuation signal, so the trend gate matters.

## How OpenCandle does it
- The black candle must open above the prior bar's high (Nison's stricter reading and TA-Lib's), not just above its close as ChartSchool says. On markets where the open equals the previous close, the pattern fires rarely.
- The black candle must close below the white body's midpoint and above its open; closing below the open makes it an engulfing pattern instead.
- The first candle must be long and white, and an uptrend is read on the bar before it.

## Open questions
- Which open rule to follow as the reference: OpenCandle uses the stricter one; ChartSchool and many other references use the previous close.
- Whether 'long white' should be enforced numerically.
