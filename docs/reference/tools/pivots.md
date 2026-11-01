---
id: pivots
name: Pivot points standard
kind: indicator
family: support / resistance levels
sources:
  - title: ChartSchool, Pivot Points
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/pivot-points
    type: secondary
  - title: Floor-trader pivot points (no single author; traditional practice)
    author: floor traders
    year: n/a
    url: common charting convention
    type: primary
confidence: medium
---

## Purpose
Support and resistance levels for the current period, computed from the prior period's high, low and close.

## How the author meant it to be used
Originated with floor traders, who computed levels at the start of the day from the prior day's high, low and close (ChartSchool). The pivot point P sets the tone: above P is positive with a target at R1 then R2; below P is weak with targets S1 then S2. Levels act as support and resistance; the second levels can mark overbought or oversold. Confirm with candlestick patterns or indicators.

## How you interact with it
Automatic. You pick the type (Traditional, Fibonacci, Woodie, Classic, DeMark, Camarilla), the pivots timeframe (Auto or fixed) and how many pivots back to draw. Levels are fixed for the whole current period: they are computed from the completed previous period and do not change until the period ends, so there is no repainting and no look-ahead. The period's data must be complete (the previous period, not the running one).

## Calculation
Standard (ChartSchool): P = (H + L + C)/3; S1 = 2P - H; S2 = P - (H - L); R1 = 2P - L; R2 = P + (H - L). Fibonacci: R1/S1 = P +/- 0.382 (H - L), R2/S2 = P +/- 0.618 (H - L), R3/S3 = P +/- 1.0 (H - L). DeMark: if C < O then X = H + 2L + C; if C > O then X = 2H + L + C; if equal X = H + L + 2C; P = X/4; S1 = X/2 - H; R1 = X/2 - L (only one pair). Woodie, Camarilla and Classic are other published variants with their own constants.

## Standard defaults
ChartSchool timeframes: 1 to 15 minute charts use the prior day; 30 to 120 minute charts use the prior week; daily charts use the prior month; weekly and monthly charts use the prior year. Standard is the default type. OpenCandle's Auto follows these rules: charts up to 15 minutes use the prior day, charts finer than a day above 15 minutes use the prior week, daily charts use the prior month, and weekly and monthly charts use the prior year. Number of pivots back defaults to 15.

## Reading it
Price relative to P, then to R1/S1 and R2/S2. Higher-timeframe pivot confluence is stronger. Levels far outside the visible range may simply be off the scale.

## Common mistakes and edge cases
- Using the current, incomplete period's high, low and close.
- Wrong prior-period boundaries: calendar week and month, not rolling 5 or 21 days.
- Session definition for the day (pre-market and after-hours bars) changes H, L and C.
- Weekly pivots from a holiday-shortened week.
- Only some types define R3 to R5.

## How OpenCandle does it
- Levels come from the most recent complete period and stay fixed for the current one, so nothing repaints.
- Auto follows ChartSchool: charts up to 15 minutes use the prior day, finer-than-daily charts above 15 minutes use the prior week, daily charts use the prior month, and weekly and monthly charts use yearly pivots.
- On US stock intraday charts only regular-session bars build the period. Woodie uses the current period's open.
- Default type is Standard, with 15 pivots drawn back.

## Open questions
Session definition for "prior day" and whether extended hours count; sources differ on the Woodie and Camarilla constants.
