---
id: chpheadshoulders
name: Head and shoulders chart pattern
kind: pattern
family: reversal
sources:
  - title: Head and Shoulders Top (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/head-and-shoulders-top
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
confidence: high
---

## Purpose
Detects a left shoulder, higher head and right shoulder after an uptrend, a major bearish reversal confirmed by a neckline break.

## How the author meant it to be used
ChartSchool: three successive peaks with the middle one (head) the highest and the two outer ones (shoulders) lower and roughly equal; the lows of the two declines join to form the neckline, which may slope up, down or be flat (a downward slope is more bearish). Volume is ideally higher on the left-shoulder advance than on the head's, and expands when the neckline breaks. The pattern is NOT complete, and the uptrend not reversed, until the neckline breaks. Target: the head-to-neckline height subtracted from the break; price often returns to test the neckline. Edwards and Magee are the classic source for the pattern, its volume behaviour and the neckline rule; Bulkowski adds statistics. What is attributed here to Edwards and Magee and to Bulkowski is paraphrased.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag; you cannot move the points of a detected pattern. Add it from the Patterns tab of the Indicators dialog. Inputs: Pivot length (default 5, range 2 to 50), Tolerance % (default 2, range 0.1 to 50) and 'Require breakout confirmation' (on for new instances, off for ones saved before it existed). The indicator first finds confirmed swing pivots: a bar is a pivot high (low) only when it is the extreme of the Pivot length bars on each side, so a pivot is known only Pivot length bars after it happened. The pattern is then matched on the latest pivots. With breakout confirmation on, the signal is on the breakout bar, the first close below the neckline (the line through the two lows), not on the last pivot. With it off, the pattern is signalled on the bar that confirms its last pivot, which is before any breakout, so it is a shape alert only. The named marker is drawn back on the last pivot, and its tooltip says "Known on <date>", the date the pattern could first be seen; a small dot in the same colour marks the signal bar. For alerts and backtests use the signal bar, not the marker. Past signals do not repaint as new bars arrive. Tolerance is the percent within which two levels count as equal, so it directly sets how strict 'equal highs' or 'parallel' is, and a larger Pivot length finds fewer, bigger patterns later.

## Calculation
Pivots high, low, high, low, high. The middle high (head) exceeds both outer highs (shoulders) by more than Tolerance, the shoulders are within Tolerance of each other, and both lows are below the lower shoulder. With breakout confirmation on, the signal is on the first close through the neckline (the line through the two lows), within the pattern's span, with no earlier close beyond its extreme.

## Standard defaults
OpenCandle defaults: Pivot length 5, Tolerance 2%. These numbers, the pivot method and every detection rule are OpenCandle's own choices; none of the sources specify them (the authors teach visual pattern recognition, with price filters such as 3% or a 3-day hold as optional breakout confirmation). Detection is from pivots only: it does not look at volume, prior-trend length, pattern duration or price-target projection, all of which the sources use as part of a good pattern.

## Reading it
A neckline break turns the shape into a reversal signal; the measured move is a guide, not a promise. Until the break, it can still resolve upward (a failed pattern).

## Common mistakes and edge cases
- Calling it at the right shoulder (breakout off) is the unconfirmed shape.
- The neckline can slope; a flat horizontal neckline is not required. Check which line OpenCandle uses (through the two lows).
- OpenCandle only tests that both lows are below the lower shoulder and the shoulders are equal within Tolerance; ChartSchool and Edwards and Magee also expect a prior uptrend and decreasing volume on the right shoulder, neither tested.
- Overlap with a double or triple top is common while the pattern forms.

## How OpenCandle does it
- Finds swing pivots with Pivot length (default 5) bars on each side, so a pattern is known only after its last pivot is confirmed. Tolerance defaults to 2%.
- Looks only at pivot prices. Volume, the length of the prior trend, pattern duration and price targets are not tested.
- With confirmation on, the breakout is a close below the neckline, the line through the two lows, extended along its slope. A close above the pattern's highest high first cancels the pattern.
- A breakout must come within as many bars after the last pivot as the pattern itself spans. A close past the pattern's far side first cancels it.
- The marker is drawn on the last pivot. Its tooltip says "Known on <date>" and a small dot marks the bar where the signal actually appears, so history never looks as if the pattern was known earlier. Signals never repaint.
- "Require breakout confirmation" is on for new instances. Turn it off to get the shape alert on the bar that confirms the last pivot. Instances saved before the option existed keep it off.

## Open questions
- Whether the neckline should be a sloped line through the two lows (as in the sources) and how OpenCandle extends it.
- Volume is not used.
