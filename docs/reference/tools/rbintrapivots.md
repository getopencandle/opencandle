---
id: rbintrapivots
name: Rob Booker - Intraday pivot points
kind: indicator
family: pivots
sources:
  - title: ChartSchool, Pivot Points (standard floor formulas)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/pivot-points
    type: secondary
  - title: Rob Booker's own trading materials (not located)
    author: Rob Booker
    year: n/a
    url: book
    type: primary
confidence: low
---

## Purpose
Support and resistance levels for the current period, computed from the prior period's high, low and close, in the Rob Booker presentation. The floor-trader pivot method is old and has no single inventor.

## How the author meant it to be used
The underlying method (ChartSchool): floor traders took the prior period's high, low and close at the start of the session to set key levels; the levels stay fixed all period. Price above the pivot is bullish bias, below bearish; R and S levels are targets and reaction zones. Which period feeds an intraday chart is a convention: ChartSchool uses the prior day for 1 to 15-minute charts and the prior week for 30 to 120-minute charts, while this tool offers Daily or 4-hour periods. Booker's own rules are not documented in the sources used.

## How you interact with it
Automatic overlay. You pick the period (Daily or 4 hours). Nothing is placed. Levels are computed from the finished prior period and held constant through the current one, so they are known at the period's first bar and never repaint. Interval changes do not change the levels, only how many bars they span.

## Calculation
From prior-period H, L, C: P = (H + L + C) / 3; R1 = 2P - L; S1 = 2P - H; R2 = P + (H - L); S2 = P - (H - L); R3 = H + 2(P - L); S3 = L - 2(H - P). ChartSchool lists P, R1, R2, S1, S2 (the R3/S3 pair is the common extension). In OpenCandle, Daily follows the exchange trading date (New York for US equities, UTC otherwise) and counts only regular-session bars for US equities; 4-hour blocks are UTC from 00:00. The first period has no levels.

## Standard defaults
Daily period, traditional formula (OpenCandle's choice; Booker's own defaults are not documented).

## Reading it
Levels are drawn only within each period (segmented lines that step at the boundary). Expect reactions at P, R1, S1, with R2/S2 and R3/S3 as extremes.

## Common mistakes and edge cases
- Using the current period's data (look-ahead).
- Including pre/after-hours highs and lows when regular-session levels are intended.
- Weekend and holiday gaps: the prior period is the prior trading period, not the prior calendar day.
- Period boundary handling for 24-hour markets.

## How OpenCandle does it
- Uses the standard floor-trader formulas, with R3 and S3 added. The period is Daily or 4 hours, and levels are fixed from the period's first bar.
- For US stocks, Daily counts regular-session bars only, and a date with no regular-session bars carries the previous levels. 4-hour blocks are UTC and include extended hours.
- The first period has no levels. Booker's own settings are not documented, so these choices are OpenCandle's.

## Open questions
What exactly distinguishes Booker's intraday pivots from the standard floor method is not documented; OpenCandle labels its choices as its own.
