---
id: aroon
name: Aroon
kind: indicator
family: trend
sources:
  - title: ChartSchool, Aroon
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/aroon
    type: secondary
  - title: TA-Lib AROON source, ta_AROON.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_AROON.c
    type: secondary
  - title: The New Technical Trader
    author: Tushar Chande and Stanley Kroll
    year: 1994
    url: book
    type: primary
confidence: medium
---

## Purpose
Measures how recently price made its highest high and lowest low in a window, to tell whether a market is trending and how strong the trend is.

## How the author meant it to be used
ChartSchool says Tushar Chande developed Aroon in 1995; "Aroon" is Sanskrit for dawn's early light, chosen because it is meant to reveal the beginning of a new trend. It measures time since the high or low, not price. The bulls have the edge when Aroon-Up is above 50 and Aroon-Down is below 50. A surge to 100 suggests a trend is emerging, confirmed by the other line falling (ChartSchool example: Aroon-Up at 100 with Aroon-Down below 30). Three stages of an emerging uptrend: Aroon-Up crosses above Aroon-Down; Up above 50 and Down below 50; Up reaches 100. Both lines low means consolidation.

## How you interact with it
Automatic. One input, length. Two lines, Aroon-Up and Aroon-Down, 0 to 100. Known at the bar's close; no repainting.

## Calculation
Aroon-Up = 100 x (N - bars since the N-bar high) / N; Aroon-Down likewise for the low. TA-Lib looks back N bars plus the current one (N + 1 bars) and, on ties, takes the most recent high or low. So a new high on the current bar gives Up = 100, and the oldest bar in the window gives 0. ChartSchool's 25-bar default example: exactly 50 is impossible on a daily chart.

## Standard defaults
ChartSchool and Chande: 25. OpenCandle's default is 14, which is a platform choice, not Chande's.

## Reading it
Crosses of the two lines, readings above 70 / below 30, and 100 / 0 extremes. High both: expanding volatility. Both low: no trend.

## Common mistakes and edge cases
- Using an N-bar window instead of N + 1 (off-by-one changes every value).
- Breaking ties toward the oldest bar instead of the newest.
- Using the close instead of high and low.
- Treating the lines as price momentum; they only count time.

## How OpenCandle does it
- The window is the current bar plus the previous N bars (N + 1 bars) so values span 0 to 100, and ties go to the newest bar, as in TA-Lib.
- Default length is 14 (Chande used 25).

## Open questions
Whether OpenCandle uses the N + 1 window and newest-wins ties of TA-Lib is not confirmed. The default of 14 differs from Chande's 25.
