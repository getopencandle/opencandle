---
id: dw-fib-fib-time-zone
name: Fib time zone
kind: drawing
family: Fibonacci
sources:
  - title: Fibonacci Time Zones (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-time-zones
    type: secondary
confidence: medium
---

## Purpose
Draws vertical lines to the right of a starting bar at Fibonacci-number distances (1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144 ...) to flag bars where a turn may be due.

## How the author meant it to be used
No named inventor is known. ChartSchool describes it as a forecasting tool: take a significant high or low, extend vertical lines at Fibonacci intervals, and watch for reversals near them. The early zones cluster tightly, so the first five or so are best ignored; the useful ones are 21, 34, 55, 89 and 144 bars. ChartSchool adds that "a little leeway is required, especially when the lengths grow longer", so the lines are not exact predictors.

## How you draw it
Two clicks, left to right. Point 1 sets zone 0. The bar distance from point 1 to point 2 is one unit. Zone n sits n units after point 1 for each Fibonacci n. Point 2's price does not matter. Both points are draggable; dragging point 2 rescales every zone. Spacing is in bars, not calendar time, so weekends and holidays are skipped, and on an interval change the lines stay on their anchor bars while the bar counts follow the data. Future zones fall right of the last bar, so the chart needs spare future room to show them. Log scale has no effect because only the time axis is used.

## Geometry and levels
Zone x = x1 + n * (x2 - x1) for n in the Fibonacci sequence. OpenCandle draws 0, 1, 2, 3, 5, 8, 13, 21, 34 and new drawings add 55 and 89. ChartSchool's introduction also mentions percentage-style levels (23.6, 38.2, 50, 61.8, 78.6 percent); those differ from the integer sequence and are a separate convention.

## Standard defaults
A one-bar unit is the classic form (point 2 one bar after point 1). OpenCandle keeps your second click as the unit.

## Reading it
Look for highs, lows or trend changes at or just after a zone, mainly at 21, 34, 55, 89 and 144. With many lines there are many coincidences, so it is weak evidence alone.

## Common mistakes and edge cases
- Using the first few tight zones as signals.
- Dragging point 2 onto point 1's bar gives zero spacing.
- Counting calendar days: ChartSchool's "days or periods" means bars.
- Starting zone 0 at an unimportant bar.

## How OpenCandle does it
- Spacing is in bars, using one unit: the bar distance of point 2.
- New drawings use 0, 1, 2, 3, 5, 8, 13, 21, 34, 55 and 89 (the duplicate 1 is drawn once).

## Open questions
- Whether to offer the percentage-style levels as an alternative mode.
- Whether OpenCandle treats the repeated 1 in the sequence as one line (it draws one).
- Book citations in the sources list are background reading. No primary source found.
