---
id: cdldoji
name: Doji (neutral)
kind: pattern
family: doji
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
Flags a bar whose open and close are virtually equal, a sign of indecision whose meaning depends on where it appears.

## How the author meant it to be used
Nison: a doji forms when the open and close are the same or very nearly the same; the shadows can be of any length, and the shape is a cross, inverted cross or plus sign. He stresses context, not the single bar: a doji after a long white candle at a high is a warning, a doji in a quiet trading range is just neutral. ChartSchool agrees: open and close 'virtually equal', indecision or a tug of war. The Nison description is paraphrased from his book.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag. Add it from the Patterns tab of the Indicators dialog; the indicator scans every bar and puts a labelled marker on the bar that COMPLETES the pattern (the last bar of the formation), and sets its 0/1 signal plot to 1 on that bar. Inputs: 'Pattern type' where both directions exist; this family is not trend-gated. The signal is known only when the completing bar has closed: on a live bar the marker can appear or vanish until the bar closes, but once the bar is closed it never moves or repaints, and no later bar is read. Nison and ChartSchool both say most candlestick patterns want follow-through (a gap, a long candle in the new direction, or heavy volume) within the next one to three bars; the indicator does NOT wait for that, it reports at completion, so confirmation is the reader's job. The trend context is read on the bar BEFORE the pattern's first bar, so the trend test never uses the pattern's own bars.

## Calculation
One bar: |close - open| is at most 5% of (high - low). Bars with zero range are ignored. Signal on that bar. Neutral: it reports no direction and is not trend-gated.

## Standard defaults
OpenCandle's numeric thresholds (its own choice, not from the sources): doji body at most 5% of the bar's range; a small shadow at most 10% of the range; a 'long' body is larger than the mean body of the previous 14 bars and a 'small' body is at most half of that mean. Bars with a missing price or zero range never take part, and the first 14 bars cannot report patterns that need a long or small body. Nison gives no numeric thresholds; he describes shapes, so any percentage is an implementation choice.

## Reading it
An alert that the bar is indecisive. By itself it neither buys nor sells; look at the bars before it (an extended trend) and the bar after it (confirmation).

## Common mistakes and edge cases
- Treating every doji as a reversal; most appear mid-trend or in ranges.
- A percentage-of-range rule makes almost any bar with a small body 'a doji' on quiet instruments; there is no minimum-range filter.
- Dragonfly, gravestone and long-legged doji are special cases that the plain Doji entry also marks.

## How OpenCandle does it
- The body must be at most 5% of the bar's own range. TA-Lib instead uses 10% of the 10-bar average range, so OpenCandle also accepts tiny-range bars.
- Bars with zero range are ignored. The pattern is neutral and not trend-gated.

## Open questions
- Nison gives no numeric tolerance; 5% of range is an implementation choice.
- Whether to require a minimum range relative to recent bars (to ignore tiny-range doji).
