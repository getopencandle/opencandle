---
id: cdlall
name: All candlestick patterns
kind: pattern
family: aggregate
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
confidence: medium
---

## Purpose
One indicator that runs every candlestick family in OpenCandle at once and marks each pattern on the bar that completes it.

## How the author meant it to be used
There is no single author of the bundle; each pattern follows Nison (primary) and ChartSchool. Both stress that a candlestick pattern is read in context (the prior trend, support and resistance, volume) and that most need follow-through within one to three bars. A bundle of every pattern makes that context judgement more important, not less.

## How you interact with it
Fully automatic; nothing is placed or moved. Inputs: 'Detect trend based on' (SMA50, 'SMA50, SMA200', or No detection) and 'Pattern type' (Bullish, Bearish or Both). Every trend-gated family uses the same trend rule, read on the bar before the pattern's first bar. 'Bullish' or 'Bearish' shows that direction only; 'Both' also shows the neutral patterns (Doji, Spinning tops). Each pattern puts a short code on the completing bar; several patterns on one bar and direction are combined into one marker with the codes on separate lines, and the bullish, bearish and neutral signal plots are 1 on that bar. Signals are known when the bar closes and do not repaint afterwards, though a live bar's marker can change before it closes. The bundle does not wait for confirmation.

## Calculation
The union of all individual candlestick families with the shared trend rule. Details of each family are in the individual pattern files (for example Engulfing (bullish), Evening star (bearish)). Common vocabulary: body = |close - open|, range = high - low, long = body larger than the mean body of the previous 14 bars, small = body at most half of that mean, doji = body at most 5% of range.

## Standard defaults
Trend rule SMA50, Pattern type Both. These are OpenCandle choices; Nison gives shapes, not numbers.

## Reading it
Treat every marker as an alert to look at the chart, not as a trade. Expect many markers on a busy chart; the continuation patterns (three methods, Tasuki, windows, marubozu) point with the trend, the reversal patterns against it.

## Common mistakes and edge cases
- Reading all patterns as equally reliable; Bulkowski-style statistics show wide differences in how often patterns work.
- Overlapping reports (an evening doji star bar also raises a doji and a doji star).
- On continuous markets, gap-based patterns (windows, abandoned baby, Tasuki, kicking) rarely appear.
- The first 14 bars cannot report patterns needing a long or small body.

## How OpenCandle does it
- Every family uses the same OpenCandle thresholds: a doji body is at most 5% of the bar's range, a small shadow at most 10% of the range, a long body is larger than the mean body of the previous 14 bars and a small body at most half of that mean. Nison gives shapes, not numbers.
- The trend rule is read on the bar before a pattern's first bar. The first 14 bars cannot report patterns that need a long or small body.
- Several patterns on one bar and direction are combined into one marker with a code per line. Nothing waits for confirmation.

## Open questions
- Whether the list should be filtered to the reliable patterns by default.
