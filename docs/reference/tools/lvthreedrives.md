---
id: lvthreedrives
name: Three Drives pattern
kind: drawing
family: harmonic
sources:
  - title: Fibonacci Ratios with Pattern Recognition
    author: Larry Pesavento
    year: 1997
    url: book
    type: primary
  - title: Harmonic Trading, Volume One
    author: Scott Carney
    year: 2010
    url: book
    type: primary
  - title: Harmonic Patterns (ChartSchool)
    author: Suri Duddella
    year: 2014
    url: https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/harmonic-patterns
    type: secondary
confidence: low
---

## Purpose
A reversal pattern of three similar-size pushes (drives) in one direction, separated by two corrections, expected to exhaust at the third drive.

## How the author meant it to be used
Pesavento is credited with putting Fibonacci ratios on the pattern (1997); Carney also describes it in Harmonic Trading, Volume One, but did not originate it (attribution from secondary sources). ChartSchool lists "3-Drives Bullish/Bearish" and describes M and W combinations. The idea: each drive is a fixed Fibonacci extension of the correction before it, and each correction a fixed retracement of the drive before it, so the market becomes stretched; the end of drive 3 is a reversal area.

## How you draw it
OpenCandle uses six points in time order: an unlabelled origin, drive 1, correction A, drive 2, correction B, drive 3. Origin is where drive 1 starts. For a bullish (buy) pattern the drives are down: origin high, drive 1 low, A rebound, drive 2 lower low, B rebound, drive 3 lowest low. Points alternate high and low and are draggable; the tool shows the consecutive-leg ratios. Points are fixed in time and price across interval changes. Common practice also compares the time (bar counts) of the drives for symmetry.

## Geometry and levels
Consecutive-leg ratios, as given in secondary sources:
- Correction retraces the preceding drive by 0.618 (some allow 0.786, so a range of 0.618 to 0.786).
- Each next drive extends the preceding correction by 1.272 (some allow up to 1.618, so a range of 1.272 to 1.618).
Pure 0.618/1.272 matches are rare, so tolerances are usual. Stop reference is often placed past the 1.618 extension of the last drive (single secondary source).
Time symmetry: drives of similar duration.

## Standard defaults
Ratios 0.618 and 1.272 for correction and drive respectively, with tolerance.

## Reading it
Drive 3 is the trade zone; wait for reversal confirmation. No reliable published success rate exists.

## Common mistakes and edge cases
- Treating the origin as a real drive point; it is only the start.
- Drives not making successive new extremes.
- Comparing legs in calendar time instead of bars.
- Log scale and large patterns distort ratios.

## How OpenCandle does it
- Six points; only the consecutive-leg ratios are shown. There is no tolerance colouring and no time-symmetry reading.
- Harmonic patterns draw above the candles.

## Open questions
- Precise ratio ranges in Pesavento's and Carney's texts.
- Whether OpenCandle's ratio labels cover corrections as well as drives.
- Book citations in the sources list are background reading and were not re-checked line by line.
