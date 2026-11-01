---
id: chprectangle
name: Rectangle chart pattern
kind: pattern
family: continuation (neutral)
sources:
  - title: Rectangle (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/rectangle
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
Detects a horizontal trading range: roughly equal highs and roughly equal lows.

## How the author meant it to be used
ChartSchool: a rectangle (trading range, consolidation, congestion) has two comparable reaction highs and two comparable reaction lows joining into parallel horizontal lines; highs and lows should preferably alternate. It is usually a continuation pattern but can mark a top or bottom, is neutral until a breakout on a closing basis (optionally filtered 3% or 3 days), and lasts from three weeks (shorter is a flag) to months, ideally about three. Volume has no standard shape. The target is the rectangle's height applied to the break. What is attributed here to Edwards and Magee and to Bulkowski is paraphrased.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag; you cannot move the points of a detected pattern. Add it from the Patterns tab of the Indicators dialog. Inputs: Pivot length (default 5, range 2 to 50), Tolerance % (default 2, range 0.1 to 50) and 'Require breakout confirmation' (on for new instances, off for ones saved before it existed). The indicator first finds confirmed swing pivots: a bar is a pivot high (low) only when it is the extreme of the Pivot length bars on each side, so a pivot is known only Pivot length bars after it happened. The pattern is then matched on the latest pivots. With breakout confirmation on, the signal is on the first close above the upper boundary or below the lower boundary (the breakout bar), and the tooltip names the side. With it off, the signal is on the bar that confirms the pattern's last pivot, which is before any breakout and so is a shape alert only. The marker and boundary lines are drawn back on the pivot bars, but the marker tooltip says 'Known on <date>' and a small dot marks the signal bar, the moment the pattern was actually knowable; for alerts and backtests use the signal bar, not the marker bar. Past signals do not repaint as new bars arrive. Tolerance is the percent within which two levels count as equal, so it directly sets how strict 'equal highs' or 'parallel' is, and a larger Pivot length finds fewer, bigger patterns later.

## Calculation
Uses the last two pivot highs and last two pivot lows. The two highs are equal within Tolerance, the two lows are equal within Tolerance, and the lows are below the highs by more than Tolerance. Neutral: it reports no direction on the plot; with breakout confirmation on, the signal is on the first close outside either boundary and the tooltip names the side.

## Standard defaults
OpenCandle defaults: Pivot length 5, Tolerance 2%. These numbers, the pivot method and every detection rule are OpenCandle's own choices; none of the sources specify them (the authors teach visual pattern recognition, with price filters such as 3% or a 3-day hold as optional breakout confirmation). Detection is from pivots only: it does not look at volume, prior-trend length, pattern duration or price-target projection, all of which the sources use as part of a good pattern.

## Reading it
A range to trade or to wait on; the break direction decides. With breakout confirmation on, the marker tooltip names the side of the first close outside the range. Bounces between the lines are the 'play the range' use.

## Common mistakes and edge cases
- No direction on the plot: the signal says 'a range exists' (or 'it broke out'), not 'buy' or 'sell'; the side is in the tooltip.
- Duration is not tested, so a very short range that ChartSchool would call a flag is reported too.
- Four points may come from a triple top, double bottom, or other shapes that overlap.

## How OpenCandle does it
- Two equal highs and two equal lows, equal within Tolerance (default 2%), with the lows below the highs by more than Tolerance.
- With "Require breakout confirmation" on (the default for new instances), the signal is the first close above the upper boundary or below the lower boundary. The pattern is neutral, so the side is named in the marker tooltip rather than in the plot colour. The breakout must come within the pattern's own span, and a close past the pattern's extreme first cancels it.
- Detection uses pivots only: no volume, no prior-trend test and no duration test.
- Past signals never repaint. The marker tooltip says "Known on <date>" and a dot marks the signal bar; the marker itself sits back on the last pivot.
- Charts saved before the confirmation option existed keep it off.

## Open questions
- Whether a minimum duration should apply.
- Whether the break side should be a separate signal.
