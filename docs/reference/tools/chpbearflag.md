---
id: chpbearflag
name: Bearish flag chart pattern
kind: pattern
family: continuation
sources:
  - title: Flag, Pennant (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/flag-pennant
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
Detects a sharp decline (the pole) followed by a short consolidation, expecting the fall to resume.

## How the author meant it to be used
ChartSchool: flags and pennants are short-term continuation patterns, a pause after a sharp advance or decline on heavy volume that marks the midpoint of the move. A flagpole runs from the break of a support or resistance level to the high or low of the pattern. The flag is a small rectangle sloping against the prior move; the pennant is a small symmetrical triangle. They last one to 12 weeks (ideally one to four): a flag over 12 weeks is a rectangle, a pennant over 12 weeks a symmetrical triangle. Volume should be heavy on the pole, contract inside the pattern, and expand on the break, which resumes the move; the pole length applied to the breakout gives the target. Edwards and Magee describe the same flags and pennants. What is attributed here to Edwards and Magee and to Bulkowski is paraphrased.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag; you cannot move the points of a detected pattern. Add it from the Patterns tab of the Indicators dialog. Inputs: Pivot length (default 5, range 2 to 50), Tolerance % (default 2, range 0.1 to 50) and 'Require breakout confirmation' (on for new instances, off for ones saved before it existed). The indicator first finds confirmed swing pivots: a bar is a pivot high (low) only when it is the extreme of the Pivot length bars on each side, so a pivot is known only Pivot length bars after it happened. The pattern is then matched on the latest pivots. With breakout confirmation on, the signal is on the breakout bar, the first close beyond the lower line of the consolidation, not on the last pivot. With it off, the pattern is signalled on the bar that confirms its last pivot, which is before any breakout, so it is a shape alert only. The named marker is drawn back on the last pivot, and its tooltip says "Known on <date>", the date the pattern could first be seen; a small dot in the same colour marks the signal bar. For alerts and backtests use the signal bar, not the marker. Past signals do not repaint as new bars arrive. Tolerance is the percent within which two levels count as equal, so it directly sets how strict 'equal highs' or 'parallel' is, and a larger Pivot length finds fewer, bigger patterns later.

## Calculation
Pivots high, low, high, low, high. The pole rises or falls by more than 3 times Tolerance, with a falling pole (first high to first low) of more than 3 times Tolerance and both later highs below the pole midpoint; this is a flag: a small rectangle sloping against the prior move, inside two parallel lines in OpenCandle: the flag highs and lows are each flat or rising (neither falls by more than Tolerance), and the second high-to-low width is at least half the first (parallel, not converging). With breakout confirmation on, the signal is on the first close below the lower line of the flag (the line through the two consolidation lows), within as many bars after the last pivot as the pattern spans; a close above the upper line or past the pole midpoint first cancels it. Off: signalled when the last pivot is confirmed.

## Standard defaults
OpenCandle defaults: Pivot length 5, Tolerance 2%. These numbers, the pivot method and every detection rule are OpenCandle's own choices; none of the sources specify them (the authors teach visual pattern recognition, with price filters such as 3% or a 3-day hold as optional breakout confirmation). Detection is from pivots only: it does not look at volume, prior-trend length, pattern duration or price-target projection, all of which the sources use as part of a good pattern.

## Reading it
A continuation setup: the trade is the break of the consolidation in the pole's direction, on rising volume. The pole must be sharp; without a sharp move the source says reliability is questionable.

## Common mistakes and edge cases
- With breakout confirmation off, the signal is at the end of the consolidation, before any breakout, so it is only a setup alert.
- A slow drift is not a pole; OpenCandle's pole test is only 3 times Tolerance (about 6%), not a measure of speed or volume.
- Duration is not tested (too long and it is a rectangle or triangle).
- Flag and pennant differ only in whether the consolidation converges, so one price action may raise either or neither.

## How OpenCandle does it
- Finds swing pivots with Pivot length (default 5) bars on each side, so a pattern is known only after its last pivot is confirmed. Tolerance defaults to 2%.
- Looks only at pivot prices. Volume, the length of the prior trend, pattern duration and price targets are not tested.
- With confirmation on, a close below the lower line of the flag is the breakout, resuming the pole's direction. A close above the upper line or past the midpoint of the pole cancels the pattern.
- A breakout must come within as many bars after the last pivot as the pattern itself spans. A close past the pattern's far side first cancels it.
- The marker is drawn on the last pivot. Its tooltip says "Known on <date>" and a small dot marks the bar where the signal actually appears, so history never looks as if the pattern was known earlier. Signals never repaint.
- "Require breakout confirmation" is on for new instances. Turn it off to get the shape alert on the bar that confirms the last pivot. Instances saved before the option existed keep it off.

## Open questions
- Whether a maximum duration and a speed test for the pole should apply.
