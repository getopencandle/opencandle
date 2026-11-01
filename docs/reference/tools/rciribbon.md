---
id: rciribbon
name: RCI ribbon
kind: indicator
family: momentum / oscillator
sources:
  - title: Spearman's rank correlation coefficient (statistics; applied to price vs time)
    author: Charles Spearman
    year: 1904
    url: book
    type: primary
  - title: RCI ribbon
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
Three rank correlation indexes of different lengths on one scale (short, middle, long) so the trend can be read across horizons at once.

## How the author meant it to be used
No author is known. The convention, from Japanese charting practice, is to watch all three: when the short RCI turns down from high territory while the long RCI is still high, a correction within an uptrend is likely; when all three line up near +80 the trend is mature; when the short line leaves -80 first, a bottom may be forming. Lines crossing the levels at +80 and -80 mark extremes.

## How you interact with it
Automatic. You set the source and three lengths. Nothing placed. Each line is an ordinary RCI (see Rank correlation index) so each value is known at the bar's close with no repaint for finished bars.

## Calculation
Each line: 100 x Spearman correlation between the tie-averaged price ranks over its window and the time order. A flat window has no value.

## Standard defaults
Commonly published lengths 10, 30 and 50; levels +80 and -80. OpenCandle-chosen where no source states them.

## Reading it
Order of the lines, their distance from the extremes, and which line turns first. The band between +80 and -80 is shading only.

## Common mistakes and edge cases
- Using different sign conventions for the three lines.
- Lengths out of order (short must be shortest).
- Early bars show only the short line.

## How OpenCandle does it
- Three RCI lines with default lengths 10, 30 and 50, each calculated exactly as in the single RCI (ties share average rank, rising price reads +100).

## Open questions
No primary source fixes the standard lengths or interpretation rules.
