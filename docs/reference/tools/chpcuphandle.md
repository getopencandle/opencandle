---
id: chpcuphandle
name: Cup and handle chart pattern
kind: pattern
family: continuation
sources:
  - title: Cup With Handle (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/cup-with-handle
    type: secondary
  - title: How to Make Money in Stocks
    author: William J. O'Neil
    year: 1988
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
Detects a rounded bowl followed by a small pullback (the handle), a bullish continuation setup.

## How the author meant it to be used
William O'Neil introduced it in his 1988 book (ChartSchool credits him). ChartSchool: a bullish continuation after an advance; the cup is U-shaped, not V-shaped, ideally retracing a third or less of the prior advance (up to a half in volatile markets, two thirds at the extreme), with roughly equal rims. The handle is a short pullback, often flag-like, retracing up to a third of the cup's advance and ideally lasting one to four weeks. The cup lasts one to six months. The breakout above the handle's resistance needs a substantial volume increase; the target is the cup depth added to the breakout. ChartSchool also stresses capturing the essence of the pattern rather than exact ratios. What is attributed here to Edwards and Magee and to Bulkowski is paraphrased.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag; you cannot move the points of a detected pattern. Add it from the Patterns tab of the Indicators dialog. Inputs: Pivot length (default 5, range 2 to 50), Tolerance % (default 2, range 0.1 to 50) and 'Require breakout confirmation' (on for new instances, off for ones saved before it existed). The indicator first finds confirmed swing pivots: a bar is a pivot high (low) only when it is the extreme of the Pivot length bars on each side, so a pivot is known only Pivot length bars after it happened. The pattern is then matched on the latest pivots. With breakout confirmation on, the signal is on the breakout bar, the first close above the higher of the two rims, not on the last pivot. With it off, the pattern is signalled on the bar that confirms its last pivot, which is before any breakout, so it is a shape alert only. The named marker is drawn back on the last pivot, and its tooltip says "Known on <date>", the date the pattern could first be seen; a small dot in the same colour marks the signal bar. For alerts and backtests use the signal bar, not the marker. Past signals do not repaint as new bars arrive. Tolerance is the percent within which two levels count as equal, so it directly sets how strict 'equal highs' or 'parallel' is, and a larger Pivot length finds fewer, bigger patterns later.

## Calculation
Pivots high, low, high, low. The two rims (highs) are within Tolerance, the bottom is below the lower rim by more than Tolerance. The cup must be rounded: at least 40% of the bars between the rims have their low in the bottom quarter of the cup depth (a V gives about 25%). The handle low stays above the cup midpoint and the handle (right rim to handle low) lasts at most half as many bars as the cup. With breakout confirmation on, the signal is on the first close above the higher rim, within as many bars after the handle low as the pattern spans, unless a close below the handle low came first. Off: signalled when the handle low is confirmed.

## Standard defaults
OpenCandle defaults: Pivot length 5, Tolerance 2%. These numbers, the pivot method and every detection rule are OpenCandle's own choices; none of the sources specify them (the authors teach visual pattern recognition, with price filters such as 3% or a 3-day hold as optional breakout confirmation). Detection is from pivots only: it does not look at volume, prior-trend length, pattern duration or price-target projection, all of which the sources use as part of a good pattern.

## Reading it
A setup: buy interest comes on a high-volume break above the handle's resistance (the rim level). Smaller handle pullbacks are more bullish.

## Common mistakes and edge cases
- With breakout confirmation off, the signal is at the handle low, before the breakout.
- The sources' prior-advance, cup-depth (one third to two thirds of the advance) and one-to-six-month cup duration limits are not tested; OpenCandle only tests rim equality, roundness, handle above the cup midpoint and handle length.
- A V-shaped low is rejected by the roundness test, which uses a 40% bar share (OpenCandle's own choice).
- A trending market with deep pullbacks can produce many false cups.

## How OpenCandle does it
- Finds swing pivots with Pivot length (default 5) bars on each side, so a pattern is known only after its last pivot is confirmed. Tolerance defaults to 2%.
- Looks only at pivot prices. Volume, the length of the prior trend, pattern duration and price targets are not tested.
- With confirmation on, the breakout is a close above the higher rim, a stricter level than the handle high. A close below the handle low first cancels the pattern.
- A breakout must come within as many bars after the last pivot as the pattern itself spans. A close past the pattern's far side first cancels it.
- The marker is drawn on the last pivot. Its tooltip says "Known on <date>" and a small dot marks the bar where the signal actually appears, so history never looks as if the pattern was known earlier. Signals never repaint.
- "Require breakout confirmation" is on for new instances. Turn it off to get the shape alert on the bar that confirms the last pivot. Instances saved before the option existed keep it off.

## Open questions
- Whether the prior advance and the cup depth limits should be tested.
