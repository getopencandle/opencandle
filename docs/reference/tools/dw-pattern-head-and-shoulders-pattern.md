---
id: dw-pattern-head-and-shoulders-pattern
name: Head and shoulders
kind: drawing
family: Chart pattern
sources:
  - title: Head and Shoulders Top (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/head-and-shoulders-top
    type: secondary
  - title: Head and Shoulders Bottom (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/head-and-shoulders-bottom
    type: secondary
  - title: Technical Analysis of Stock Trends
    author: Robert D. Edwards and John Magee
    year: 1948
    url: book
    type: primary
  - title: Encyclopedia of Chart Patterns
    author: Thomas N. Bulkowski
    year: 2005
    url: book
    type: secondary
confidence: medium
---

## Purpose
A manual annotation of a head and shoulders reversal: three peaks (or troughs for the inverse), the middle one the extreme, joined by a neckline, with a price target.

## How the author meant it to be used
Edwards and Magee described the pattern as a major reversal formation; ChartSchool follows that. Top: after an uptrend, a left shoulder peak, a higher head, and a right shoulder that is lower than the head and roughly level with the left. The lows after the left shoulder and after the head are joined as the neckline, which can slope up, down or be flat (a downward slope is more bearish). The pattern is not complete, and the trend is not reversed, until the neckline breaks, ideally on expanding volume. After the break the price target is the distance from the head to the neckline projected from the break. Price often returns to retest the broken neckline, which now acts as resistance. The bottom form mirrors this, and volume matters more for bottoms.

## How you draw it
By common practice seven points in time order: the pattern start, left shoulder, first neckline point, head, second neckline point, right shoulder, and the pattern end. OpenCandle uses seven points. All points are draggable. The neckline passes through the two neckline points and runs between where it meets the first and last legs. The shape is anchored to bars and prices and stays on them across interval changes. Direction (top or bottom) comes from point placement, not a setting. On a log scale the neckline should be in displayed scale, and the target is better measured as a percentage.

## Geometry and levels
Neckline: line through the two reaction lows (top) or highs (bottom). Head height H = head price minus neckline price at the head's time. Target = neckline at the breakout bar minus H for a top, plus H for a bottom. Shoulders should be roughly equal in height; symmetry is preferred but not required.

## Standard defaults
Labels for left shoulder, head, right shoulder and neckline; no automatic target in many tools.

## Reading it
Per ChartSchool: confirm the break of the neckline, watch volume (rising on the head's decline and the neckline break for a top), and treat the target as a rough guide. A break may fail, and there is often a retest.

## Common mistakes and edge cases
- Treating the pattern as a signal before the neckline breaks.
- Marking it without a prior trend to reverse.
- Head not clearly the extreme, or shoulders at very different levels.
- Using a sloping neckline's value at the wrong time when measuring the target.

## How OpenCandle does it
- Seven points, with LS, H and RS labels on pills.
- The dashed neckline runs through points 3 and 5 between where it meets the first and last legs. It does not extend to the right.
- No target and no validation.
- Draws above the candles.

## Open questions
- Number of points OpenCandle takes.
- Whether OpenCandle draws the target and whether it validates the shape.
- Verification status: the ChartSchool top and bottom pages were consulted.
