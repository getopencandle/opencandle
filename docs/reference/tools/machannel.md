---
id: machannel
name: Moving average channel
kind: indicator
family: moving averages / channels
sources:
  - title: ChartSchool, Moving Averages (simple and exponential)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-averages-simple-and-exponential
    type: secondary
  - title: Moving-average channel from the high and the low (common charting convention; no single author found)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: medium
---

## Purpose
Two moving averages form a channel: one of the highs (upper) and one of the lows (lower). Price is read against the channel as support, resistance and trend.

## How the author meant it to be used
No single author; the construction is a standard charting convention: upper = average of highs, lower = average of lows, each over its own length, optionally shifted forward. Price above the channel suggests strength, below it weakness, inside is neutral. This differs from the percentage envelope, which offsets one average by a fixed percent.

## How you interact with it
Automatic. You set the upper length, lower length, and an offset (bars shifted forward) for each line. Nothing is placed. Values on the current bar use only current and earlier bars. A forward offset moves a line right onto future bar slots, which is allowed because it uses only past data; a backward shift would read the future and must not be offered.

## Calculation
Upper(t) = SMA of high over the upper length ending at t. Lower(t) = SMA of low over the lower length ending at t. The displayed upper at bar t is Upper(t - upperOffset), likewise lower. An SMA is the plain mean of N values, undefined until N bars exist. A missing high or low in the window makes the value unavailable.

## Standard defaults
Length 20 each, offset 0 (OpenCandle defaults; the convention gives no fixed number).

## Reading it
A close above the upper line or below the lower line is a trend-strength cue. A narrow channel means a quiet range.

## Common mistakes and edge cases
- Averaging closes for both lines (that gives one line, not a channel).
- Applying the offset backward.
- Different lengths for upper and lower are legal; the lines can cross.
- Warm-up: nothing until the line's window fills.

## Open questions
Whether other averaging types should be selectable; whether crossing lines should be allowed.
