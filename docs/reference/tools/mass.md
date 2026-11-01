---
id: mass
name: Mass index
kind: indicator
family: volatility
sources:
  - title: The Mass Index (Technical Analysis of Stocks & Commodities)
    author: Donald Dorsey
    year: 1992
    url: book
    type: primary
  - title: Mass Index
    author: StockCharts ChartSchool
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/mass-index
    type: secondary
confidence: high
---

## Purpose
Uses the widening and narrowing of the high-low range to flag possible trend reversals, with no directional bias.

## How the author meant it to be used
Dorsey looked for a "reversal bulge": the index rises above 27, then falls back below 26.5. The bulge completes only on the fall back. It says a reversal is likely, not which way; the direction comes from the existing trend (a bulge after an uptrend suggests a bearish reversal) and other tools (ChartSchool pairs it with TRIX or MACD). The index rarely exceeds 27, so chartists often lower the thresholds (for example 26) by looking at the instrument's history.

## How you interact with it
Automatic, in its own pane. Inputs: EMA length, sum length. Known at bar close; the bulge signal is known only when the index drops back through 26.5. Guide lines are drawn at 27 and 26.5; the bulge is not marked automatically.

## Calculation
Range = High - Low. Single EMA = EMA(Range, 9). Double EMA = EMA(Single, 9). Ratio = Single / Double. Mass Index = sum of Ratio over 25 bars.

## Standard defaults
9 and 25; thresholds 27 and 26.5 (Dorsey).

## Reading it
Typical readings sit in the mid 20s (the ratio is about 1 and 25 are summed). Sharp rises mean range expansion.

## Common mistakes and edge cases
- Sum of the ratio, not an average.
- The double EMA is EMA of EMA, not a second price EMA.
- Start-up needs about 2 x 8 + 25 bars.
- Treating a bulge as a direction signal.

## How OpenCandle does it
- Guide lines at 27 and 26.5 are drawn so Dorsey's reversal bulge is easy to see.
- The bulge itself is not marked automatically: look for the index to rise above 27 and then fall back below 26.5.
- Uses 9-bar EMAs, each starting from a simple average, and sums the ratio over 25 bars.

## Open questions

