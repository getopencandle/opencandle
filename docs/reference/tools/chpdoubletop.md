---
id: chpdoubletop
name: Double top chart pattern
kind: pattern
family: reversal
sources:
  - title: Double Top Reversal (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/double-top-reversal
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
Detects two roughly equal peaks separated by a trough, the classic bearish reversal after an uptrend.

## How the author meant it to be used
ChartSchool: a bearish reversal with two consecutive, roughly equal peaks and a moderate trough; it needs a significant prior uptrend of several months, and the reversal is NOT complete until support (the lowest point between the peaks) is broken, ideally on expanding volume. It suggests a 10 to 20% decline between the peaks, peaks about a month apart or more, a price target equal to the peak-to-support distance subtracted from the break, and an optional filter such as a 3% break or a 3-day hold. Its caution: 'avoid jumping the gun', wait for the break. Edwards and Magee and Bulkowski describe the same structure; Bulkowski emphasises confirmation as a close below the valley low. What is attributed here to Edwards and Magee and to Bulkowski is paraphrased.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag; you cannot move the points of a detected pattern. Add it from the Patterns tab of the Indicators dialog. Inputs: Pivot length (default 5, range 2 to 50), Tolerance % (default 2, range 0.1 to 50), 'Require breakout confirmation' (on for new instances, off for ones saved before it existed) and 'Textbook size rules' (on for new instances, off for ones saved before it existed). The indicator first finds confirmed swing pivots: a bar is a pivot high (low) only when it is the extreme of the Pivot length bars on each side, so a pivot is known only Pivot length bars after it happened. The pattern is then matched on the latest pivots. With breakout confirmation on, the signal is on the breakout bar, the first close below the valley between the two highs, not on the last pivot. With it off, the pattern is signalled on the bar that confirms its last pivot, which is before any breakout, so it is a shape alert only. The named marker is drawn back on the last pivot, and its tooltip says "Known on <date>", the date the pattern could first be seen; a small dot in the same colour marks the signal bar. For alerts and backtests use the signal bar, not the marker. Past signals do not repaint as new bars arrive. Tolerance is the percent within which two levels count as equal, so it directly sets how strict 'equal highs' or 'parallel' is, and a larger Pivot length finds fewer, bigger patterns later.

## Calculation
Pivots high, low, high. The two highs are within Tolerance of each other and the low is below the lower high by more than Tolerance. With breakout confirmation on, the signal is on the first close below the valley low, within as many bars after the last pivot as the pattern spans, and only if no earlier close had already gone beyond the pattern's extreme. Off: signalled when the second high is confirmed.

## Standard defaults
OpenCandle defaults: Pivot length 5, Tolerance 2%. These numbers, the pivot method and every detection rule are OpenCandle's own choices; none of the sources specify them (the authors teach visual pattern recognition, with price filters such as 3% or a 3-day hold as optional breakout confirmation). Detection is from pivots only: it does not look at volume or price-target projection. Prior-trend direction, minimum depth, spacing and duration are tested only where the Textbook size rules option applies (daily and longer bars; see How OpenCandle does it). The sources use all of these as part of a good pattern.

## Reading it
Bearish only after a break of the valley. The target is the pattern height projected down from the break; the valley then tends to act as resistance on a retest. A failed pattern (price closes above the peaks) is itself informative.

## Common mistakes and edge cases
- Signalling at the second peak (breakout off) is the unconfirmed shape; the source says the reversal is not valid until support breaks.
- Peaks too close together are ordinary resistance (ChartSchool: about a month apart at least). With Textbook size rules off OpenCandle tests only Tolerance; with them on (daily and longer bars) it requires the tops 10 bars apart and a valley at least 10% deep.
- With Textbook size rules off there is no prior-uptrend test: a double top inside a range or downtrend is still reported. With them on, price must have come from below the pattern. Known quirk: a retest of a slightly higher earlier peak can read as a downtrend.
- A triple top forming (third peak) turns a double top into a different pattern, and both may be reported.

## How OpenCandle does it
- Finds swing pivots with Pivot length (default 5) bars on each side, so a pattern is known only after its last pivot is confirmed. Tolerance defaults to 2%.
- Looks only at pivot prices. Volume and price targets are not tested; prior trend, spacing and duration are tested only by Textbook size rules (below).
- With confirmation on, the breakout is a close below the valley between the two highs. A close above the pattern's highest high first cancels the pattern.
- A breakout must come within as many bars after the last pivot as the pattern itself spans. A close past the pattern's far side first cancels it.
- The marker is drawn on the last pivot. Its tooltip says "Known on <date>" and a small dot marks the bar where the signal actually appears, so history never looks as if the pattern was known earlier. Signals never repaint.
- "Require breakout confirmation" is on for new instances. Turn it off to get the shape alert on the bar that confirms the last pivot. Instances saved before the option existed keep it off.
- Textbook size rules (on for new instances; off for instances saved before it existed; applied only on daily and longer bars, intraday bars are never changed): A double top needs the valley between its tops at least 10% below the first top (a double bottom: the rise between its bottoms at least 10% above the first bottom) and the two tops at least 10 bars apart (Bulkowski, "at least 10%, but allow exceptions", and his tests used a two-week minimum; ChartSchool, "Double Top Reversal", "at least 10%"). A reversal pattern (double, triple, head and shoulders and their inverses) needs a prior trend: going back from the bar before its first pivot, the first bar that trades outside the pattern's price range must lie below it for a top and above it for a bottom, meaning price came from beyond the pattern's far side (Bulkowski glossary, ChartSchool). Only bars before the first pivot are read. Known quirk: a retest of a slightly higher earlier peak can read as the wrong trend.

## Open questions
- Whether the Textbook size rules should also apply to intraday bars; the sources give no intraday numbers.
- Breakout window length ('as many bars as the pattern spans') is OpenCandle's own rule.
