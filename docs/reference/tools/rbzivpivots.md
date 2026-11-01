---
id: rbzivpivots
name: Rob Booker - Ziv ghost pivots
kind: indicator
family: pivots
sources:
  - title: ChartSchool, Pivot Points (floor formulas)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/pivot-points
    type: secondary
  - title: Rob Booker's own materials on ghost pivots (not located)
    author: Rob Booker
    year: n/a
    url: book
    type: primary
confidence: low
---

## Purpose
Projects the next period's pivot levels while the current period is still forming ("ghost" levels), so a trader sees where tomorrow's pivots would sit.

## How the author meant it to be used
OpenCandle defines the idea as the standard pivot formulas applied to the current period's high, low and close so far. Treat the intent as: as the day develops, the projected next-day pivot, R1, S1, R2 and S2 move, and traders watch where they converge with the current levels. This is OpenCandle's reading and may differ from Booker's own.

## How you interact with it
Automatic overlay. Choose the period (Daily or 4 hours). Nothing placed. Unlike ordinary pivots, the lines move during the period (they use the period's bars up to the current bar) and stop changing once the period closes; a closed bar's value never changes afterwards.

## Calculation
At each bar, H, L, C = running high, running low and latest close of the current period up to that bar. P = (H + L + C) / 3; R1 = 2P - L; S1 = 2P - H; R2 = P + (H - L); S2 = P - (H - L). Only P, R1, S1, R2, S2 are plotted (no third level).

## Standard defaults
Daily period (OpenCandle choice).

## Reading it
Early in a period the ghost levels swing widely; they stabilise as the range forms. A ghost P far from the current P suggests a shifted bias for the next period.

## Common mistakes and edge cases
- Treating ghost levels as final before the period closes.
- Using the full period's high/low (look-ahead).
- Period boundaries and session filters as for ordinary intraday pivots.

## How OpenCandle does it
- Uses the running high, low and close of the current period, so levels move until the period ends. Only P, R1, S1, R2 and S2 are drawn.
- For US stock Daily, pre-market bars show nothing until the first regular-session bar. A missing price blanks the rest of the period.
- Booker's own formula is not documented; this is OpenCandle's reading.

## Open questions
Booker's ghost pivots may use a different formula or time base; this entry rests on OpenCandle's own definition.
