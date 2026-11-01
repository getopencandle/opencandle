---
id: cdleveningstar
name: Evening star (bearish)
kind: pattern
family: star
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
A three-bar bearish reversal at the end of an advance: long white, gapped-up small candle, then a long black candle.

## How the author meant it to be used
Nison: the evening star is the top counterpart of the morning star. A long white candle in an uptrend; a small real body (the star, either colour) that gaps up from it, real body to real body; then a black candle that closes well into the first white body. Nison wants the third candle to penetrate the white body, and notes the pattern is more significant if a gap also separates the star from the third candle. ChartSchool says the third close should be below the midpoint of the first candle; the long black candle supplies the bearish confirmation. The Nison description is paraphrased from his book.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag. Add it from the Patterns tab of the Indicators dialog; the indicator scans every bar and puts a labelled marker on the bar that COMPLETES the pattern (the last bar of the formation), and sets its 0/1 signal plot to 1 on that bar. Inputs: 'Detect trend based on' (SMA50, 'SMA50, SMA200', or No detection) and, where the family has both directions, 'Pattern type' (Bullish, Bearish or Both). Trend rule SMA50: uptrend means the close is above its 50-bar average, downtrend below. 'SMA50, SMA200' additionally needs the 50 above (or below) the 200. No detection accepts every bar. The signal is known only when the completing bar has closed: on a live bar the marker can appear or vanish until the bar closes, but once the bar is closed it never moves or repaints, and no later bar is read. Nison and ChartSchool both say most candlestick patterns want follow-through (a gap, a long candle in the new direction, or heavy volume) within the next one to three bars; the indicator does NOT wait for that, it reports at completion, so confirmation is the reader's job. The trend context is read on the bar BEFORE the pattern's first bar, so the trend test never uses the pattern's own bars.

## Calculation
Three bars. Bar 1 white with a long body. Bar 2 a small non-doji body (at most half the 14-bar average body) gapping ABOVE bar 1's close. Bar 3 black closing below bar 1's body midpoint. Signal on bar 3. Trend gate: an uptrend on the bar before bar 1. A doji in the middle goes to the Evening Doji star entry instead.

## Standard defaults
OpenCandle's numeric thresholds (its own choice, not from the sources): doji body at most 5% of the bar's range; a small shadow at most 10% of the range; a 'long' body is larger than the mean body of the previous 14 bars and a 'small' body is at most half of that mean. Bars with a missing price or zero range never take part, and the first 14 bars cannot report patterns that need a long or small body. Nison gives no numeric thresholds; he describes shapes, so any percentage is an implementation choice.

## Reading it
A bearish reversal after an advance, fairly reliable by candlestick standards because the third bar already shows the turn. A gap between the star and the third bar, and volume on the black bar, add weight.

## Common mistakes and edge cases
- Expecting a gap before bar 3: only the star's gap from bar 1 is required in OpenCandle.
- Middle bar colour does not matter, only the body gap.
- A middle bar that is a doji belongs to the Evening Doji star entry.

## How OpenCandle does it
- The star is a small non-doji body (at most half the average body) that gaps above bar 1's body. A doji in the middle goes to Evening Doji star instead.
- Bar 3 must close below the midpoint of bar 1's body (TA-Lib uses a shallower 30% penetration). No gap between the star and bar 3 is required.
- A "long" body is larger than the average body of the previous 14 bars; a "small" body is at most half of that average; a doji body is at most 5% of its own range.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
- Whether OpenCandle should also require bar 3 to open below the star's body (a stronger variant).
