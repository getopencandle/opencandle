---
id: rvat
name: Relative volume at time
kind: indicator
family: volume
sources:
  - title: ChartSchool, Relative Volume (RVOL)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-volume-rvol
    type: secondary
confidence: medium
---

## Purpose
Compares the volume so far at this time of day (or of the week or month) with the average volume at the same time in earlier periods, so an intraday bar is judged against what is normal for that moment rather than against all bars.

## How the author meant it to be used
No inventor. ChartSchool's RVOL is current volume over the average volume across the prior bars (50-period SMA default), where above 1 is above average; many day traders look for more than 2; a spike of 4 or more, especially at overbought or oversold extremes, can foreshadow a reversal rather than continuation. High RVOL shows commitment behind a move. ChartSchool also lists a Time of Day variant as a separate indicator, but its definition is not reproduced here, so the time-aligned formula is convention.

## How you interact with it
Automatic. You set the anchor timeframe (daily, weekly, monthly), the look-back count of earlier periods, and the mode (cumulative or regular). Nothing placed. The current bar uses its own volume so far, and the live bar's value rises as volume arrives; finished bars do not change. Earlier periods are only past ones, so no look-ahead.

## Calculation
Cumulative mode: volume since the start of the current period up to this time, divided by the average of the same cumulative quantity at the same time in each of the previous N periods. Regular mode: this bar's volume divided by the average volume of the bar at the same time in the previous N periods. Same time means the same minute of the day (weekly anchor: same weekday and minute; monthly: same day of month and minute). Only earlier periods that have a bar at that time count; fewer than N available, or a zero average, gives no value. Daily-or-longer charts compare whole bars.

## Standard defaults
OpenCandle: anchor Daily, length 10, cumulative (OpenCandle-chosen). ChartSchool's plain RVOL uses 50.

## Reading it
1 = typical for the time; above 2 is unusual activity; below 1 is quiet. Most useful near the open, when raw volume is high but expected volume is high too.

## Common mistakes and edge cases
- Comparing to the all-bar average instead of the same time of day.
- Wrong session boundary: pre-market and after-hours bars must count toward the trading date.
- Holidays and half days shorten the session so the same-time bar is missing.
- Current period excluded from the average.

## How OpenCandle does it
- The average uses only earlier periods, never the current one, and needs the full count of earlier periods that have a bar at that time slot. With fewer, or a zero average, no value is shown.
- Defaults: Daily anchor, length 10, cumulative mode.

## Open questions
The time-of-day definition rests on convention, not a single published source.
