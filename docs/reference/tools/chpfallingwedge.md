---
id: chpfallingwedge
name: Falling wedge chart pattern
kind: pattern
family: reversal
sources:
  - title: Falling Wedge (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/falling-wedge
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
Detects converging, downward-sloping highs and lows, a bullish pattern where selling momentum fades.

## How the author meant it to be used
ChartSchool: a bullish pattern that begins wide at the top and contracts as price falls; reaction lows still push lower but each by less, so the lower line is flatter than the upper. Ideally it forms after an extended downtrend (at least three months) over three to six months with at least two (ideally three) lower highs and two lower lows. It is confirmed by a break above the resistance line (sometimes waiting for the prior reaction high), and volume expansion on the breakout is essential. Like the rising wedge it can also act as a continuation (against an uptrend). What is attributed here to Edwards and Magee and to Bulkowski is paraphrased.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag; you cannot move the points of a detected pattern. Add it from the Patterns tab of the Indicators dialog. Inputs: Pivot length (default 5, range 2 to 50), Tolerance % (default 2, range 0.1 to 50) and 'Require breakout confirmation' (on for new instances, off for ones saved before it existed). The indicator first finds confirmed swing pivots: a bar is a pivot high (low) only when it is the extreme of the Pivot length bars on each side, so a pivot is known only Pivot length bars after it happened. The pattern is then matched on the latest pivots. With breakout confirmation on, the signal is on the breakout bar, the first close above the upper line, not on the last pivot. With it off, the pattern is signalled on the bar that confirms its last pivot, which is before any breakout, so it is a shape alert only. The named marker is drawn back on the last pivot, and its tooltip says "Known on <date>", the date the pattern could first be seen; a small dot in the same colour marks the signal bar. For alerts and backtests use the signal bar, not the marker. Past signals do not repaint as new bars arrive. Tolerance is the percent within which two levels count as equal, so it directly sets how strict 'equal highs' or 'parallel' is, and a larger Pivot length finds fewer, bigger patterns later.

## Calculation
Uses the last two pivot highs and last two pivot lows. Both fall by more than Tolerance, and the highs fall faster than the lows, so the range narrows. With breakout confirmation on, the signal is on the first close above the upper line, within as many bars after the last pivot as the pattern spans, unless a close below the lower line came first. Off: signalled when the last pivot is confirmed.

## Standard defaults
OpenCandle defaults: Pivot length 5, Tolerance 2%. These numbers, the pivot method and every detection rule are OpenCandle's own choices; none of the sources specify them (the authors teach visual pattern recognition, with price filters such as 3% or a 3-day hold as optional breakout confirmation). Detection is from pivots only: it does not look at volume, prior-trend length, pattern duration or price-target projection, all of which the sources use as part of a good pattern.

## Reading it
A bullish bias confirmed by a close above the upper line, ideally on rising volume (volume is not tested).

## Common mistakes and edge cases
- With breakout confirmation off, the shape alone is not a buy signal.
- Volume, central to the source, is not tested.
- Two points per line are the minimum used.

## How OpenCandle does it
- Finds swing pivots with Pivot length (default 5) bars on each side, so a pattern is known only after its last pivot is confirmed. Tolerance defaults to 2%.
- Looks only at pivot prices. Volume, the length of the prior trend, pattern duration and price targets are not tested.
- With confirmation on, the breakout is a close above the upper line, as ChartSchool describes. A close below the lower line first cancels the pattern.
- A breakout must come within as many bars after the last pivot as the pattern itself spans. A close past the pattern's far side first cancels it.
- The marker is drawn on the last pivot. Its tooltip says "Known on <date>" and a small dot marks the bar where the signal actually appears, so history never looks as if the pattern was known earlier. Signals never repaint.
- "Require breakout confirmation" is on for new instances. Turn it off to get the shape alert on the bar that confirms the last pivot. Instances saved before the option existed keep it off.

## Open questions
