---
id: crsi
name: Connors RSI
kind: indicator
family: momentum
sources:
  - title: ChartSchool, ConnorsRSI
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/connorsrsi
    type: secondary
  - title: ConnorsRSI
    author: Larry Connors and Connors Research
    year: 2012
    url: book
    type: primary
confidence: medium
---

## Purpose
A short-term composite oscillator that averages three views: price momentum, the length of the current up or down streak, and how large today's change is compared with recent changes. Aimed at short timeframes where the standard 14-period RSI is too slow.

## How the author meant it to be used
ChartSchool, crediting Larry Connors and Connors Research: ConnorsRSI = (RSI(close, 3) + RSI(streak, 2) + PercentRank(100)) / 3. Connors recommends 90 and 10 as overbought and oversold levels (some chartists use 95 and 5 on volatile instruments). Dropping below the oversold threshold is a buying opportunity and rising above the overbought threshold hints at a pullback; reaching either extreme is a cue to look at other technical conditions.

## How you interact with it
Automatic. Inputs: price RSI length (3), streak RSI length (2), rank length (100), source. Value known at bar close. Very early bars are unavailable, because the rank needs a full window.

## Calculation
Component 1: Wilder RSI of the source, length 3. Component 2: streak = consecutive closes up (+1, +2, ...) or down (-1, -2, ...) compared with the prior close; an unchanged close resets the streak to 0; then RSI of the streak, length 2. Component 3: percent rank of today's 1-period percentage change among the previous N changes (100 by default), that is the percentage of those earlier values that are lower than today's. ChartSchool's example: 7 of 20 lower gives 35 percent. Average of the three. OpenCandle: the streak starts on the second bar; the first value appears on bar rankLength + 2.

## Standard defaults
3, 2, 100. Levels 90 / 10 (Connors). OpenCandle draws guides at 70 / 30, which is a display choice and differs from Connors.

## Reading it
Bounded 0 to 100. Extremes, not the midline, carry the signal.

## Common mistakes and edge cases
- Ranking the price level instead of the percentage change.
- Including the current value in the rank window (ChartSchool describes comparing with the previous periods).
- Not resetting the streak on an unchanged close.
- Using 70 / 30 levels with a tool designed for 90 / 10.

## How OpenCandle does it
- Percent rank compares today's 1-bar percent change with the previous 100 changes, current bar excluded, counting only strictly lower values.
- The streak resets to zero on an unchanged close and on a missing value.
- Guide lines sit at 70 and 30; Connors works with 90 and 10 as the extremes.

## Open questions
The sources are loose on whether the rank window includes the current bar and on ties; OpenCandle excludes the current bar and counts only strictly lower values.
