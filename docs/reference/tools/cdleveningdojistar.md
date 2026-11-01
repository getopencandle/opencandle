---
id: cdleveningdojistar
name: Evening Doji star (bearish)
kind: pattern
family: doji star (3 bar)
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
The evening star variant in which the middle bar is a doji, treated as a stronger top signal.

## How the author meant it to be used
Nison: when the star in an evening star is a doji, the pattern is an evening doji star, and he considers it more bearish than an ordinary evening star, because the doji shows complete indecision at the high. ChartSchool's dictionary describes it the same way: a large white candle, a doji that opens higher and closes at its open, then a candle closing below the midpoint of the first. The abandoned baby is the rarer form in which the doji's shadows also gap. The Nison description is paraphrased from his book.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag. Add it from the Patterns tab of the Indicators dialog; the indicator scans every bar and puts a labelled marker on the bar that COMPLETES the pattern (the last bar of the formation), and sets its 0/1 signal plot to 1 on that bar. Inputs: 'Detect trend based on' (SMA50, 'SMA50, SMA200', or No detection) and, where the family has both directions, 'Pattern type' (Bullish, Bearish or Both). Trend rule SMA50: uptrend means the close is above its 50-bar average, downtrend below. 'SMA50, SMA200' additionally needs the 50 above (or below) the 200. No detection accepts every bar. The signal is known only when the completing bar has closed: on a live bar the marker can appear or vanish until the bar closes, but once the bar is closed it never moves or repaints, and no later bar is read. Nison and ChartSchool both say most candlestick patterns want follow-through (a gap, a long candle in the new direction, or heavy volume) within the next one to three bars; the indicator does NOT wait for that, it reports at completion, so confirmation is the reader's job. The trend context is read on the bar BEFORE the pattern's first bar, so the trend test never uses the pattern's own bars.

## Calculation
As for Evening star but bar 2 must be a doji (body at most 5% of its range) gapping above bar 1's close; bar 3 black closing below bar 1's midpoint. Signal on bar 3. Trend gate: an uptrend before bar 1.

## Standard defaults
OpenCandle's numeric thresholds (its own choice, not from the sources): doji body at most 5% of the bar's range; a small shadow at most 10% of the range; a 'long' body is larger than the mean body of the previous 14 bars and a 'small' body is at most half of that mean. Bars with a missing price or zero range never take part, and the first 14 bars cannot report patterns that need a long or small body. Nison gives no numeric thresholds; he describes shapes, so any percentage is an implementation choice.

## Reading it
Bearish reversal after an advance; read like an evening star, with a little more weight.

## Common mistakes and edge cases
- A doji whose shadows overlap bar 1's still counts (body gap only); it is an abandoned baby only when the shadows also clear.
- The same bars can raise both this entry and the abandoned baby in an all-patterns view.

## How OpenCandle does it
- The middle bar is a doji (body at most 5% of its own range) whose body gaps above bar 1's body. Its shadows may overlap bar 1's; when they clear completely it is an abandoned baby instead.
- Bar 1 must have a long body and bar 3 must close below the midpoint of bar 1's body (TA-Lib uses a shallower 30% penetration).
- The same bars can raise both this mark and the abandoned baby when all patterns are shown.
- A "long" body is larger than the average body of the previous 14 bars; a "small" body is at most half of that average; a doji body is at most 5% of its own range.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
- Whether the plain Evening star should exclude doji middle bars (OpenCandle gives the doji case its own entry).
