---
id: chptriangle
name: Triangle chart pattern
kind: pattern
family: continuation (neutral)
sources:
  - title: Symmetrical Triangle (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/symmetrical-triangle
    type: secondary
  - title: Ascending Triangle (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/ascending-triangle
    type: secondary
  - title: Descending Triangle (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/descending-triangle
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
Detects converging highs and lows (symmetrical, ascending or descending) with a narrowing range.

## How the author meant it to be used
ChartSchool and Edwards and Magee: a triangle is two converging trend lines. Symmetrical: lower highs and higher lows (at least four points), usually a continuation (Edwards and Magee are credited with roughly 75% continuation and 25% reversal), with volume shrinking and an ideal breakout about half to three quarters of the way to the apex; a break before the half way mark may be premature. Ascending: a flat top with rising lows, bullish bias. Descending: a flat bottom with falling highs, bearish bias. Breakouts count on a close, with an optional 3% or 3-day filter and expanding volume; the usual target is the pattern's widest height applied to the break. What is attributed here to Edwards and Magee and to Bulkowski is paraphrased.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag; you cannot move the points of a detected pattern. Add it from the Patterns tab of the Indicators dialog. Inputs: Pivot length (default 5, range 2 to 50), Tolerance % (default 2, range 0.1 to 50) and 'Require breakout confirmation' (on for new instances, off for ones saved before it existed). The indicator first finds confirmed swing pivots: a bar is a pivot high (low) only when it is the extreme of the Pivot length bars on each side, so a pivot is known only Pivot length bars after it happened. The pattern is then matched on the latest pivots. With breakout confirmation on, the signal is on the first close above the upper boundary or below the lower boundary (the breakout bar), and the tooltip names the side. With it off, the signal is on the bar that confirms the pattern's last pivot, which is before any breakout and so is a shape alert only. The marker and boundary lines are drawn back on the pivot bars, but the marker tooltip says 'Known on <date>' and a small dot marks the signal bar, the moment the pattern was actually knowable; for alerts and backtests use the signal bar, not the marker bar. Past signals do not repaint as new bars arrive. Tolerance is the percent within which two levels count as equal, so it directly sets how strict 'equal highs' or 'parallel' is, and a larger Pivot length finds fewer, bigger patterns later.

## Calculation
Uses the last two pivot highs and last two pivot lows: the highs are not rising and the lows are not falling (a move within Tolerance counts as flat), not both flat, and the second high-to-low width is narrower than the first. This covers symmetrical, ascending and descending shapes in one neutral entry, with no direction on the plot.

## Standard defaults
OpenCandle defaults: Pivot length 5, Tolerance 2%. These numbers, the pivot method and every detection rule are OpenCandle's own choices; none of the sources specify them (the authors teach visual pattern recognition, with price filters such as 3% or a 3-day hold as optional breakout confirmation). Detection is from pivots only: it does not look at volume, prior-trend length, pattern duration or price-target projection, all of which the sources use as part of a good pattern.

## Reading it
A coil that precedes a move. Direction comes from the shape (ascending bullish, descending bearish, symmetrical neutral) and, in all cases, from the breakout. With breakout confirmation on, the marker tooltip names the side of the first close outside the triangle.

## Common mistakes and edge cases
- One entry reports all triangle types; the shape type is not named, though the tooltip names the break side.
- Breakout position relative to the apex is not tested.
- Two highs and two lows is the minimum; a very short two-pivot 'triangle' is weaker than the sources' four touch points.
- Overlaps wedges and pennants on the same pivots.

## How OpenCandle does it
- One neutral entry covers symmetrical, ascending and descending triangles: the highs are not rising, the lows are not falling, they are not both flat, and the second high-to-low width is narrower than the first. A move within Tolerance (default 2%) counts as flat.
- With "Require breakout confirmation" on (the default for new instances), the signal is the first close outside either boundary, and the marker tooltip names the side. The breakout must come within the pattern's own span, and a close past the pattern's extreme first cancels it.
- Detection uses pivots only: no volume, no prior-trend test and no duration test.
- Past signals never repaint. The marker tooltip says "Known on <date>" and a dot marks the signal bar; the marker itself sits back on the last pivot.
- Charts saved before the confirmation option existed keep it off.

## Open questions
- Whether OpenCandle should name the sub-type.
- Whether it should require volume contraction.
