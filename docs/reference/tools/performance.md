---
id: performance
name: Performance
kind: indicator
family: statistics / returns
sources:
  - title: ChartSchool, Performance Spread
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/performance-spread
    type: secondary
  - title: Simple period return
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
Shows how much the instrument has gained or lost over fixed look-backs: one week, one month, three months, six months, year to date and one year.

## How the author meant it to be used
No author. It is the plain percentage return over standard calendar horizons, used to see short, medium and long term strength side by side. the 1W/1M/3M/6M/YTD/1Y set is the common table.

## How you interact with it
Automatic, no inputs. The latest values update as the live bar changes; historical values at each bar are computed from that bar's close and a reference close, so they do not repaint. Horizons are calendar-based (not N bars), so they behave the same across chart intervals.

## Calculation
Return = 100 x (close / reference close - 1). The reference close is the newest bar at or before the same instant one week, or n calendar months, earlier. YTD uses the newest bar before 1 January. Month arithmetic clamps at month end (31 Mar minus 1 month = end of Feb).

## Standard defaults
Periods 1W, 1M, 3M, 6M, YTD, 1Y.

## Reading it
Compare the lines: all positive and ordered means persistent strength; short negative against long positive means a pullback in an uptrend.

## Common mistakes and edge cases
- Using bar counts instead of calendar dates.
- Using the reference bar after the target instant (look-ahead).
- Time zone and calendar-year boundary for YTD.
- A reference before the first loaded bar gives no value rather than a wrong one.
- A zero or missing reference close.

## How OpenCandle does it
- Horizons are calendar-based with month-end clamping, so 31 March minus one month lands on the end of February.
- Year to date uses the last bar before 1 January (UTC). A reference date before the first loaded bar gives no value.

## Open questions
YTD uses the last close of the prior year; using the first close of the current year instead would differ by one day's move.
