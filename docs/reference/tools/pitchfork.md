---
id: pitchfork
name: Andrews pitchfork
kind: drawing
family: pitchfork
sources:
  - title: Andrews' Pitchfork (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/andrews-pitchfork
    type: secondary
  - title: Dr. Alan Andrews' Advanced Course (median line method)
    author: Alan H. Andrews
    year: 1960
    url: book
    type: primary
  - title: The Best Trendline Methods of Alan Andrews and Five New Trendline Techniques
    author: Patrick Mikula
    year: 2000
    url: book
    type: secondary
  - title: Support and Resistance with the Andrews Pitchfork
    author: Barbara Star
    year: 1995
    url: https://stockcharts.com
    type: secondary
confidence: medium
---

## Purpose
A three-pivot trend channel whose centre line (the median line) predicts the path price tends to return to, with two parallel outer lines marking likely support and resistance.

## How the author meant it to be used
Alan Andrews taught the "median line method" in courses from the 1960s; his students, notably Patrick Mikula, later wrote it up. His core claim is that price tends to come back to the median line, often cited as roughly 80% of the time, so the median line is a magnet and a target. Related Andrews rules reported by secondary sources: if price fails to reach the median line the trend is weak and a reversal is more likely (Hagopian's rule is the usual name for the follow-on move); a close through the median line, followed by a retest, flips its role; "warning lines" (extra parallels at the same spacing outside the fork) mark overextension. ChartSchool's version is simpler: the outer lines are support and resistance, the median line shows strength, prices should reach it regularly in an uptrend, and a break of the lower line signals reversal.

## How you draw it
Three clicks, in time order from left to right: point 1 is the start of the handle (the pivot where the fork originates, also called the anchor), point 2 and point 3 are the next two pivots of opposite kind (a high then a low, or a low then a high). Point 1 sets the slope; ChartSchool warns that a too-steep fork breaks easily and a too-flat one misses the trend, so moving point 1 is the main adjustment. All three points are draggable; the median line always passes through point 1 and the midpoint of 2 and 3. The median line and the two parallels extend to the right indefinitely (to the right edge of the chart), starting from point 1 for the median line and from points 2 and 3 for the outer lines. The structure is defined in time and price coordinates; the slope must be computed in the scale the chart is displayed in (so lines look straight on a log chart). It does not measure bars or calendar time as such, but extension to the right continues over future bars, including weekends and gaps where the chart's time axis skips them.

## Geometry and levels
Let P1 be point 1, P2 and P3 points 2 and 3. M = midpoint of P2 and P3 (average of times and of prices). Median line: ray from P1 through M. Upper and lower lines: rays through P2 and P3 parallel to the median line. Because the outer lines are equidistant from the median line, they pass through P2 and P3 exactly. Optional extra parallels at multiples of the P2-P3 half-width (warning lines) sit at 1.0x further out in the same spacing. Trigger lines (ChartSchool) are rays from P1 through P2 and through P3: a break above the one through the high point is a buy signal, below the one through the low point is a sell signal.

## Standard defaults
Median line plus two parallels; some implementations add 0.25, 0.5, 0.75 internal fork lines and 1.5 or 2.0 outer ratios (Fibonacci pitchfork variants). Original method is just the three lines.

## Reading it
In an uptrend the lower line is support, the upper line resistance, and the median line shows strength; failure to reach it is a warning. Breaks of an outer line often reverse the trend; ChartSchool notes a broken line then tends to switch roles. The author-level warning is that point selection is a judgement call with no hard rules, and different valid choices give different forks.

## Common mistakes and edge cases
- Wrong click order (P2 and P3 must be the two pivots after P1; P3 before P2 in time gives a distorted fork).
- Treating point 1 as having to be the extreme; it should be a pivot but is often adjusted.
- Log scale: if the fork is built in linear price but displayed on log, it will look bent; build in the displayed scale.
- Very small P2-P3 gap: outer lines nearly coincide with the median line.
- Inverted ordering (P2 above P3 vs below): forks should work in both directions.

## How OpenCandle does it
- Draws the three lines plus the P2-P3 base, built on screen so the lines stay straight on a log chart.
- The lines extend in the direction you drew them.
- No warning lines and no trigger lines.

## Open questions
- Which scale (linear or log) OpenCandle builds the fork in.
- Whether warning lines and trigger lines are available.
- Whether Andrews' 80% median-line rule can be verified from his own writing.
- Book citations in the sources list are background reading and were not re-checked line by line.
