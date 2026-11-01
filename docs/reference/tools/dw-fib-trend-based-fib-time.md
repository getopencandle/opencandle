---
id: dw-fib-trend-based-fib-time
name: Trend-based fib time
kind: drawing
family: Fibonacci
sources:
  - title: Fibonacci Time Zones (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-time-zones
    type: secondary
  - title: Fibonacci time projection from a measured swing
    author: common charting convention
    year: 2024
    url: book
    type: secondary
confidence: low
---

## Purpose
Projects future time lines from a measured swing: the time length of one move, scaled by Fibonacci ratios and laid out from the end of the next move, to flag bars where a reversal may fall.

## How the author meant it to be used
No author is known. The idea extends Fibonacci time analysis (ChartSchool's time zones use Fibonacci-number multiples of a base unit) by taking the base unit from an actual swing instead of from one bar. The ratios (0.382, 0.618, 1, 1.382, 1.618, 2, 2.618 ...) are the usual Fibonacci family.

## How you draw it
Three clicks, left to right. Points 1 and 2 are the ends of the measured swing; its time length (bars from point 1 to point 2) is the unit. Point 3 is the anchor where the projection starts, typically the end of the retracement that follows the swing. All three points are draggable. Vertical lines then fall at point 3's time plus ratio times the unit. A dashed trend line may connect points 1, 2 and 3. The shape is anchored to bars, and spacing is in bars, so weekends and holidays are skipped. Prices of the points matter only for the connecting trend line, not for the time lines. Log scale has no effect on the vertical lines.

## Geometry and levels
Line r is at x = x3 + r * (x2 - x1). Ratio 0 falls on point 3. OpenCandle's factory ratios are 0, 0.382, 0.5 (hidden), 0.618, 1, 1.382, 1.618, 2, 2.382, 2.618, 3, with every level except 0.5 visible.

## Standard defaults
As above, with the trend line shown dashed grey, two pixels wide.

## Reading it
Turns, accelerations or pauses near a projected line are taken as evidence the swing's rhythm repeats. Ratio 1 (equal time) and 0.618 and 1.618 are usually the most watched.

## Common mistakes and edge cases
- Drawing point 3 before point 2 in time reverses the direction of projection.
- Zero time between points 1 and 2 gives no spacing.
- Counting calendar time rather than bars changes the result across holidays.

## How OpenCandle does it
- Verticals sit at P3 + ratio x (bars from P1 to P2), counted in bars.
- Default levels: 0, 0.382, 0.618, 1, 1.382, 1.618, 2, 2.382, 2.618 and 3 (0.5 is hidden). New drawings get a dashed grey trend line through P1, P2 and P3.

## Open questions
- Whether the unit should be bars or calendar time on intraday charts with gaps (bars is OpenCandle convention).
- Only the ChartSchool time zones page covers this tool. All construction details are common practice or from OpenCandle's code, unverified.
