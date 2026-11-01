---
id: relvolume
name: Relative volume
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
Compares current volume with what is normal, as a ratio. Above 1 means busier than normal, below 1 quieter.

## How the author meant it to be used
There is no single original author or canonical definition; the main published reference is ChartSchool's. It describes RVOL as comparing each bar's volume with the average volume over a number of prior bars, to spot setups where unusually high or low volume is powering a move. Higher RVOL shows commitment to the move and suggests the trend continues; low RVOL suggests lack of commitment. It also warns that a spike to 4.0 or more, especially when overbought or oversold, can foreshadow a reversal. A second form, time of day (RVOL-TOD), compares a bar's volume with the average for the same time of day, because volume is much higher at the start and end of the session.

## How you interact with it
Automatic. You set the look-back and perhaps the mode. Nothing is placed.

## Calculation
RVOL = current volume / average volume over the look-back period. ChartSchool's intro says "prior bars" but its formula does not say whether the current bar is inside the average. OpenCandle excludes it: the average covers the previous L bars only, which keeps a volume spike from pulling its own baseline up. ChartSchool's average is a simple moving average by default (50 periods), and it can be switched to exponential. Time of day: ChartSchool's example compares today's 9:30 five-minute bar with the average of previous 9:30 five-minute bars, using the same formula (it is bar-by-bar, not cumulative volume to that time; cumulative-to-time versions are another practitioner variant). Scale can be shown as a ratio (baseline 1.0) or a percentage (baseline 0). The live bar's ratio keeps rising as the bar fills, so it is final only at the close.

## Standard defaults
ChartSchool default: 50-period SMA, baseline 1.0. It says many day traders look for RVOL above 2.0, a 1.1 reading is rarely actionable, and anything over 4.0 is treated as a spike. Thresholds are conventions.

## Reading it
High ratio on a breakout supports it; ChartSchool also notes pullbacks on low RVOL are likely just pullbacks, while high RVOL on a drop suggests commitment to a new down trend. Use with other indicators, not alone.

## Common mistakes and edge cases
- Missing volume (forex, some indices): ratio is undefined, not zero.
- Zero average (new listings, thin symbols) gives division by zero.
- Halted or half days distort time-of-day matching.
- Daylight saving or session changes break clock alignment.
- Including the current bar in its own baseline compresses spikes toward 1 (OpenCandle leaves it out).
- Using it on daily bars with a time-of-day mode.

## How OpenCandle does it
- The baseline is the simple average of the previous L bars, not including the current bar. The Volume MA line shows that same average.
- Default length is 20 (ChartSchool uses 50) and the highlight threshold is 2.0.
- This is the plain per-bar form, not time of day. A bar with missing volume is skipped in the average, and a zero average leaves the bar blank.

## Open questions
ChartSchool does not state whether the baseline includes the current bar. OpenCandle uses the plain per-bar form, not time of day (see Relative volume at time for that).
