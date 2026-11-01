---
id: cdldowntasuki
name: Downside Tasuki gap (bearish)
kind: pattern
family: tasuki gap
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
  - title: Encyclopedia of Candlestick Charts
    author: Thomas N. Bulkowski
    year: 2008
    url: book
    type: secondary
confidence: medium
---

## Purpose
A three-bar bearish CONTINUATION pattern: a gap down in a downtrend, then a white bar that tries to fill the gap but fails.

## How the author meant it to be used
Nison classifies the downside Tasuki gap as a continuation pattern in a downtrend: a long black candle, a second black candle that gaps down from it, and a third white candle that opens within the second black body and closes in the gap between the first two candles but does not close the gap. The failure to close the gap is the point: the bounce could not reverse the trend, and the gap acts as resistance. ChartSchool's dictionary says the same. The Nison description is paraphrased from his book.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag. Add it from the Patterns tab of the Indicators dialog; the indicator scans every bar and puts a labelled marker on the bar that COMPLETES the pattern (the last bar of the formation), and sets its 0/1 signal plot to 1 on that bar. Inputs: 'Detect trend based on' (SMA50, 'SMA50, SMA200', or No detection) and, where the family has both directions, 'Pattern type' (Bullish, Bearish or Both). Trend rule SMA50: uptrend means the close is above its 50-bar average, downtrend below. 'SMA50, SMA200' additionally needs the 50 above (or below) the 200. No detection accepts every bar. The signal is known only when the completing bar has closed: on a live bar the marker can appear or vanish until the bar closes, but once the bar is closed it never moves or repaints, and no later bar is read. Nison and ChartSchool both say most candlestick patterns want follow-through (a gap, a long candle in the new direction, or heavy volume) within the next one to three bars; the indicator does NOT wait for that, it reports at completion, so confirmation is the reader's job. The trend context is read on the bar BEFORE the pattern's first bar, so the trend test never uses the pattern's own bars.

## Calculation
Three bars. Bar 1 black (no length test). Bar 2 black, with a gap down between bar 1 and bar 2's ranges. Bar 3 white, opens inside bar 2's body, and closes inside the gap (above bar 2's high, below bar 1's low) without closing it. Signal on bar 3. Trend gate (continuation role): a downtrend on the bar before bar 1.

## Standard defaults
OpenCandle's numeric thresholds (its own choice, not from the sources): doji body at most 5% of the bar's range; a small shadow at most 10% of the range; a 'long' body is larger than the mean body of the previous 14 bars and a 'small' body is at most half of that mean. Bars with a missing price or zero range never take part, and the first 14 bars cannot report patterns that need a long or small body. Nison gives no numeric thresholds; he describes shapes, so any percentage is an implementation choice.

## Reading it
Bearish continuation: the downtrend is expected to resume. The unclosed gap is the level to watch; a close back above the top of the gap (bar 1's low) cancels the idea.

## Common mistakes and edge cases
- It is a continuation pattern, so it needs a prior downtrend; in an uptrend the same shape is not meaningful.
- Gap rules: a body gap and a full range gap give different results where shadows overlap.
- Rare on markets without gaps.

## How OpenCandle does it
- The gap between bars 1 and 2 is a full range (shadow) gap, and bar 3 must close inside it without closing it. TA-Lib instead uses a real-body gap and near-equal bodies on bars 2 and 3.
- Bar 1 only needs to be black; there is no length test.

## Open questions
- OpenCandle uses a full range gap between bars 1 and 2 (bar 2's high below bar 1's low) and requires bar 3 to close above bar 2's high; whether Nison means range or body gaps is not verified.
- Whether a partial gap fill (close above the gap's midpoint) should count.
