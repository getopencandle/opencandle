---
id: chprisingwedge
name: Rising wedge chart pattern
kind: pattern
family: reversal
sources:
  - title: Rising Wedge (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/rising-wedge
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
Detects converging, upward-sloping highs and lows, a bearish pattern where rallies lose steam.

## How the author meant it to be used
ChartSchool: a bearish pattern that begins wide and contracts as price rises; the upper line rises more slowly than the lower, so momentum wanes at each new high. It needs at least two (ideally three) rising reaction highs and two rising reaction lows, usually forms over three to six months, and is confirmed only when the lower support line breaks convincingly (sometimes waiting for the break of the previous reaction low). Volume ideally declines as price rises and expands on the break. Notable: it can also appear as a continuation inside a downtrend, and it is one of the hardest patterns to recognise and trade. What is attributed here to Edwards and Magee and to Bulkowski is paraphrased.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag; you cannot move the points of a detected pattern. Add it from the Patterns tab of the Indicators dialog. Inputs: Pivot length (default 5, range 2 to 50), Tolerance % (default 2, range 0.1 to 50) and 'Require breakout confirmation' (on for new instances, off for ones saved before it existed). The indicator first finds confirmed swing pivots: a bar is a pivot high (low) only when it is the extreme of the Pivot length bars on each side, so a pivot is known only Pivot length bars after it happened. The pattern is then matched on the latest pivots. With breakout confirmation on, the signal is on the first close below the lower line extended forward (the breakout bar). A close above the upper line first voids the pattern. With it off, the signal is on the bar that confirms the pattern's last pivot, which is before any breakout and so is a shape alert only. The marker and boundary lines are drawn back on the pivot bars, but the marker tooltip says 'Known on <date>' and a small dot marks the signal bar, the moment the pattern was actually knowable; for alerts and backtests use the signal bar, not the marker bar. Past signals do not repaint as new bars arrive. Tolerance is the percent within which two levels count as equal, so it directly sets how strict 'equal highs' or 'parallel' is, and a larger Pivot length finds fewer, bigger patterns later.

## Calculation
Uses the last two pivot highs and last two pivot lows. Both rise by more than Tolerance, and the lows rise faster than the highs, so the range narrows.

## Standard defaults
OpenCandle defaults: Pivot length 5, Tolerance 2%. These numbers, the pivot method and every detection rule are OpenCandle's own choices; none of the sources specify them (the authors teach visual pattern recognition, with price filters such as 3% or a 3-day hold as optional breakout confirmation). Detection is from pivots only: it does not look at volume, prior-trend length, pattern duration or price-target projection, all of which the sources use as part of a good pattern.

## Reading it
A bearish bias that is only confirmed by the support break. With breakout confirmation on, the signal waits for a close below the lower line. A rising wedge in a downtrend is a continuation pattern, not a reversal; OpenCandle has no trend gate.

## Common mistakes and edge cases
- With breakout confirmation off, the signal marks the shape, not the break; trading the shape is early.
- Only two highs and two lows are used; the sources want at least three touches ideally.
- Inside a downtrend the same shape is a continuation with a different meaning.
- Overlaps ascending triangles and channels when slopes are close.

## How OpenCandle does it
- Both highs and both lows rise by more than Tolerance (default 2%), and the lows rise faster than the highs.
- With "Require breakout confirmation" on (the default for new instances), the signal is the first close below the lower line extended forward from the two pivot lows. A close above the upper line first voids the pattern. The breakout must come within the pattern's own span, and a close past the pattern's extreme first cancels it.
- Detection uses pivots only: no volume, no prior-trend test and no duration test.
- Past signals never repaint. The marker tooltip says "Known on <date>" and a dot marks the signal bar; the marker itself sits back on the last pivot.
- Charts saved before the confirmation option existed keep it off.

## Open questions
- Whether a prior-trend test should be added.
