---
id: chptriplebottom
name: Triple bottom chart pattern
kind: pattern
family: reversal
sources:
  - title: Triple Bottom Reversal (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/triple-bottom-reversal
    type: secondary
  - title: Technical Analysis of Stock Trends
    author: Robert D. Edwards and John Magee
    year: 1948
    url: book
    type: primary
  - title: Encyclopedia of Chart Patterns
    author: Thomas N. Bulkowski
    year: 2005 (2nd ed.)
    url: book
    type: secondary
confidence: medium
---

## Purpose
Detects three roughly equal lows followed by a break above resistance, a bullish reversal.

## How the author meant it to be used
ChartSchool: a bullish reversal made of three equal lows after a clear downtrend, confirmed by a break above resistance, which is the HIGHEST of the intervening highs. It forms over three to six months as a major reversal; volume typically increases on the breakout, and broken resistance becomes support. What is attributed here to Edwards and Magee and to Bulkowski is paraphrased.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag; you cannot move the points of a detected pattern. Add it from the Patterns tab of the Indicators dialog. Inputs: Pivot length (default 5, range 2 to 50), Tolerance % (default 2, range 0.1 to 50) and 'Require breakout confirmation' (on for new instances, off for ones saved before it existed). The indicator first finds confirmed swing pivots: a bar is a pivot high (low) only when it is the extreme of the Pivot length bars on each side, so a pivot is known only Pivot length bars after it happened. The pattern is then matched on the latest pivots. With breakout confirmation on, the signal is on the first close through the neckline or the valley or peak (the breakout bar), not on the last pivot; with it off, the pattern is signalled on the bar that confirms its last pivot, which is before any breakout and so is a shape alert only. The marker and boundary lines are drawn back on the pivot bars, but the marker tooltip says 'Known on <date>' and a small dot marks the signal bar, the moment the pattern was actually knowable; for alerts and backtests use the signal bar, not the marker bar. Past signals do not repaint as new bars arrive. Tolerance is the percent within which two levels count as equal, so it directly sets how strict 'equal highs' or 'parallel' is, and a larger Pivot length finds fewer, bigger patterns later.

## Calculation
Pivots low, high, low, high, low. The three lows lie within Tolerance of each other and both highs between them are above the highest low by more than Tolerance. With breakout confirmation on, the signal is on the first close above the highest of the highs, within the pattern's span, with no earlier close beyond its extreme.

## Standard defaults
OpenCandle defaults: Pivot length 5, Tolerance 2%. These numbers, the pivot method and every detection rule are OpenCandle's own choices; none of the sources specify them (the authors teach visual pattern recognition, with price filters such as 3% or a 3-day hold as optional breakout confirmation). Detection is from pivots only: it does not look at volume, prior-trend length, pattern duration or price-target projection, all of which the sources use as part of a good pattern.

## Reading it
Bullish after a close above the highest intervening high. Before that it is a range with a flat floor.

## Common mistakes and edge cases
- Resistance is the highest high, not the last one.
- Three equal lows also fit a rectangle or descending triangle; those are not bullish.
- Volume and prior trend not tested.

## How OpenCandle does it
- The three lows must agree within Tolerance (default 2%), measured as the largest minus the smallest against the largest. The confirmation level is the highest of the two highs between the lows.
- With "Require breakout confirmation" on (the default for new instances), the signal is the first close above that level. The breakout must come within the pattern's own span, and a close past the pattern's extreme first cancels it.
- Detection uses pivots only: no volume, no prior-trend test and no duration test.
- Past signals never repaint. The marker tooltip says "Known on <date>" and a dot marks the signal bar; the marker itself sits back on the last pivot.

## Open questions
- Whether a minimum duration should apply.
