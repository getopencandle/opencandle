---
id: rci
name: Rank correlation index
kind: indicator
family: momentum / oscillator
sources:
  - title: Spearman's rank correlation coefficient (statistics; applied to price vs time)
    author: Charles Spearman
    year: 1904
    url: book
    type: primary
  - title: Rank Correlation Index
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: medium
---

## Purpose
An oscillator from -100 to +100 that measures how closely the order of prices over a window matches the order of time. +100 means prices rose steadily, -100 steadily fell.

## How the author meant it to be used
Statistics origin: Spearman's rank correlation between two series. In charting, one series is the price ranks over the last N bars and the other is the time order. It is widely used in Japanese technical analysis, where levels near +80 and -80 mark overbought and oversold. Typical reading: a turn down from above +80 is a sell cue, a turn up from below -80 is a buy cue; a trend in the RCI can also be read with several lengths at once (see RCI ribbon).

## How you interact with it
Automatic. You set length, source and an optional smoothing (none, SMA with Bollinger bands, EMA, SMMA, WMA, VWMA). Nothing placed. Computed at each bar's close from the last N bars; the live bar's rank changes while it forms, finished bars do not change.

## Calculation
Rank the N prices in the window ascending so the lowest has rank 1 (ties get the average of their positions). Let the time rank run 1..N with the newest bar highest. RCI = 100 x rho. Without ties, rho = 1 - 6 x sum(d squared) / (N (N squared - 1)), d = price rank minus time rank. With ties use the Pearson correlation of the two rank series (the tie-corrected form), which OpenCandle uses. A window of identical prices has no correlation: no value. Some Japanese definitions rank price highest-first so the sign is flipped; check which convention before comparing numbers.

## Standard defaults
Length 12 is common here (OpenCandle default); 9, 26 and 52 are also seen in Japanese practice. Levels +80, 0, -80.

## Reading it
Above +80 with the line turning down = overbought exit; below -80 turning up = oversold exit; zero cross as trend change. Short RCI reacts quickly, long RCI shows the larger trend. Strong trends can pin it at the extreme.

## Common mistakes and edge cases
- Not averaging tied ranks.
- Reversing the time order (flips the sign).
- Ranking by percentage change rather than price.
- Length 1 has no correlation (minimum 2).
- Bollinger bands on the RCI use the population standard deviation in OpenCandle.

## How OpenCandle does it
- Ranks prices ascending against time ascending, so a steadily rising price reads +100.
- Tied prices share the average rank (Pearson form). A window of identical prices gives no value.
- Default length is 12. Bollinger bands on the RCI use the population standard deviation.

## Open questions
No primary charting source; sources differ on sign and tie conventions.
