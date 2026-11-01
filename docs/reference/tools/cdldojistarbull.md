---
id: cdldojistarbull
name: Doji star (bullish)
kind: pattern
family: doji star
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
A two-bar warning: after a long candle in the trend, a doji gaps away from its real body.

## How the author meant it to be used
Nison defines a star as a small real body that gaps away from the preceding long real body (body to body; shadows may overlap), and a doji star as a star that is a doji. After a long white candle in an uptrend, a gapping-up doji is a bearish warning; after a long black candle in a downtrend, a gapping-down doji is a bullish warning. Nison treats the doji star as the first two bars of a morning or evening doji star and wants the third candle (a candle in the new direction) before calling the reversal complete. The Nison description is paraphrased from his book.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag. Add it from the Patterns tab of the Indicators dialog; the indicator scans every bar and puts a labelled marker on the bar that COMPLETES the pattern (the last bar of the formation), and sets its 0/1 signal plot to 1 on that bar. Inputs: 'Detect trend based on' (SMA50, 'SMA50, SMA200', or No detection) and, where the family has both directions, 'Pattern type' (Bullish, Bearish or Both). Trend rule SMA50: uptrend means the close is above its 50-bar average, downtrend below. 'SMA50, SMA200' additionally needs the 50 above (or below) the 200. No detection accepts every bar. The signal is known only when the completing bar has closed: on a live bar the marker can appear or vanish until the bar closes, but once the bar is closed it never moves or repaints, and no later bar is read. Nison and ChartSchool both say most candlestick patterns want follow-through (a gap, a long candle in the new direction, or heavy volume) within the next one to three bars; the indicator does NOT wait for that, it reports at completion, so confirmation is the reader's job. The trend context is read on the bar BEFORE the pattern's first bar, so the trend test never uses the pattern's own bars.

## Calculation
Two bars. Bar 1 black with a long body (judged against the 14-bar average body). Bar 2 a doji whose BODY sits entirely below bar 1's close (gap down, body to body). Signal on bar 2. Trend gate: a downtrend on the bar before bar 1.

## Standard defaults
OpenCandle's numeric thresholds (its own choice, not from the sources): doji body at most 5% of the bar's range; a small shadow at most 10% of the range; a 'long' body is larger than the mean body of the previous 14 bars and a 'small' body is at most half of that mean. Bars with a missing price or zero range never take part, and the first 14 bars cannot report patterns that need a long or small body. Nison gives no numeric thresholds; he describes shapes, so any percentage is an implementation choice.

## Reading it
A warning, not a trigger. It becomes a full reversal only if the next bar confirms (a candle in the new direction that closes well into bar 1). When it does, OpenCandle also reports the morning/evening doji star on that third bar.

## Common mistakes and edge cases
- Reading it as a completed reversal: Nison treats it as incomplete until the third candle.
- Body-to-body gap versus shadow gap: the star only needs the BODY gap; the abandoned baby needs the shadow gap too.
- On charts without gaps (continuous markets) the pattern will rarely appear.

## How OpenCandle does it
- The gap is between the bodies (the doji body clears the first candle's close), the same as TA-Lib's real-body gap. Shadows may overlap.
- Nison wants a confirming third bar; OpenCandle reports on the doji bar and does not wait. When a third bar confirms, the morning or evening doji star is reported on it.

## Open questions
- Whether OpenCandle should wait one bar for confirmation (it does not).
- Whether OpenCandle's body-gap reading is exactly Nison's; this has not been checked against the book text.
