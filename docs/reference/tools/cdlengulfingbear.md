---
id: cdlengulfingbear
name: Engulfing (bearish)
kind: pattern
family: engulfing
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
confidence: high
---

## Purpose
A two-bar reversal in which the second real body completely covers the first and is the opposite colour.

## How the author meant it to be used
Nison's requirements: a definable trend; the second real body engulfs the first (shadows are NOT required to be engulfed); the second body is the opposite colour of the first, with the first ideally a small body. The bullish engulfing appears in a downtrend and shows buyers taking control; the bearish in an uptrend. ChartSchool agrees: only the open and close need to be engulfed, which separates it from an outside reversal (whole range engulfed). ChartSchool adds that the first candle's size matters little but it should not be a doji, that the bigger the engulfing candle the stronger the reversal, and that further follow-through is required to confirm. The Nison description is paraphrased from his book.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag. Add it from the Patterns tab of the Indicators dialog; the indicator scans every bar and puts a labelled marker on the bar that COMPLETES the pattern (the last bar of the formation), and sets its 0/1 signal plot to 1 on that bar. Inputs: 'Detect trend based on' (SMA50, 'SMA50, SMA200', or No detection) and, where the family has both directions, 'Pattern type' (Bullish, Bearish or Both). Trend rule SMA50: uptrend means the close is above its 50-bar average, downtrend below. 'SMA50, SMA200' additionally needs the 50 above (or below) the 200. No detection accepts every bar. The signal is known only when the completing bar has closed: on a live bar the marker can appear or vanish until the bar closes, but once the bar is closed it never moves or repaints, and no later bar is read. Nison and ChartSchool both say most candlestick patterns want follow-through (a gap, a long candle in the new direction, or heavy volume) within the next one to three bars; the indicator does NOT wait for that, it reports at completion, so confirmation is the reader's job. The trend context is read on the bar BEFORE the pattern's first bar, so the trend test never uses the pattern's own bars.

## Calculation
Two bars. Bar 1 white. Bar 2 black with open at or above bar 1's close and close at or below bar 1's open, and a body larger than bar 1's. Signal on bar 2. Trend gate: an uptrend on the bar before bar 1.

## Standard defaults
OpenCandle's numeric thresholds (its own choice, not from the sources): doji body at most 5% of the bar's range; a small shadow at most 10% of the range; a 'long' body is larger than the mean body of the previous 14 bars and a 'small' body is at most half of that mean. Bars with a missing price or zero range never take part, and the first 14 bars cannot report patterns that need a long or small body. Nison gives no numeric thresholds; he describes shapes, so any percentage is an implementation choice.

## Reading it
A reversal alert. The more decisive the engulfing candle and the more extended the prior trend, the stronger the case. ChartSchool wants follow-through within one to three bars.

## Common mistakes and edge cases
- Equality counts: OpenCandle accepts a body that only matches the first body's edge; some readers require strictly beyond.
- Confusing it with an outside bar: shadows do not need to be engulfed.
- A second body only slightly larger than a tiny first body engulfs trivially; OpenCandle only requires 'larger'.
- Nison allows exceptions to the colour rule when the first body is very small; OpenCandle requires opposite colours.

## How OpenCandle does it
- Bar 2's body must be larger than bar 1's and cover it. A body that only matches bar 1's edge still counts.
- Bar 1 must be white and bar 2 black; the opposite-colour rule has no exception for a very small first body.
- Shadows do not need to be engulfed, so this is not an outside bar.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
- Equal-edge engulfing is accepted by OpenCandle; the sources do not state this precisely.
- Whether to demand a 'small' first body as Nison prefers.
