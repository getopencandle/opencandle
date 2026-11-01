---
id: elliottimpulse
name: Elliott impulse wave
kind: drawing
family: Elliott
also: [elliottcorrection]
sources:
  - title: The Wave Principle
    author: R. N. Elliott
    year: 1938
    url: book
    type: primary
  - title: Elliott Wave Principle: Key to Market Behavior
    author: A. J. Frost and Robert R. Prechter Jr.
    year: 1978
    url: book
    type: primary
  - title: Introduction to Elliott Wave Theory (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/market-analysis/elliott-wave-analysis-articles/introduction-to-elliott-wave-theory
    type: secondary
  - title: Identifying Elliott Wave Patterns (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/market-analysis/elliott-wave-analysis-articles/identifying-elliott-wave-patterns
    type: secondary
  - title: Guidelines for Applying Elliott Wave Theory (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/market-analysis/elliott-wave-analysis-articles/guidelines-for-applying-elliott-wave-theory
    type: secondary
confidence: medium
---

## Purpose
Labels a five-wave motive sequence (1-2-3-4-5, an impulse) and its three-wave correction (A-B-C) on the chart, so the analyst can check the wave count against Elliott's rules.

## How the author meant it to be used
R. N. Elliott (1930s) proposed that market moves unfold in a repeating 5-3 pattern at every scale: a five-wave motive phase in the direction of the larger trend, then a three-wave corrective phase, giving an eight-wave cycle (ChartSchool). Frost and Prechter (1978) made the theory widely known and added the guidelines. Impulses are subdivided 5-3-5-3-5; corrections often 5-3-5 (zigzag) or 3-3-5 (flat); triangles are 3-3-3-3-3 (A-B-C-D-E). Wave counts are meant as probabilistic maps, revised as price evolves; an invalidated rule means the count must be relabelled.

## How you draw it
OpenCandle's impulse uses six points in time order: an unlabelled origin (where wave 1 starts), then the ends of waves 1, 2, 3, 4 and 5. The corrective (also in this file) uses four points: origin, then the ends of A, B and C. All points are draggable pivots. Points are anchored in time and price, so they stay on their bars across interval changes. The tool normally draws connected legs with labels (1-5 or A-C), and the direction is determined by the first leg (up for a bullish impulse, down for bearish). The drawing is not scale-dependent in itself, but wave relationships are scale-dependent: the Guideline of Scale recommends checking both arithmetic and semi-log charts, with semi-log better for large long-term trends.

## Geometry and levels
Impulse rules (cannot be broken, otherwise it is not an impulse):
1. Wave 2 never retraces more than 100% of wave 1.
2. Wave 3 is never the shortest of waves 1, 3 and 5 (ChartSchool also states wave 3 always travels beyond the end of wave 1).
3. Wave 4 never overlaps the price territory of wave 1 (except in diagonals).
Guidelines (tendencies, not rules): wave 3 is often the longest and most likely to extend; if wave 3 extends, wave 5 tends toward equality with wave 1; wave 2 and wave 4 alternate (sharp vs sideways); a correction often ends in the area of the previous wave 4 of lesser degree; channeling: draw wave 1-3 and wave 2-4 trend lines to estimate where wave 5 ends. Common (secondary, from Frost and Prechter) ratio habits: wave 2 retraces about 0.5 to 0.618 of wave 1, wave 3 about 1.618 of wave 1, wave 4 about 0.236 to 0.382 of wave 3, wave 5 about 0.618 to 1.0 of wave 1 or of waves 1 to 3. Truncated fifth: wave 5 fails to pass the end of wave 3. Ending diagonals break the wave 4 overlap rule. Corrective (A-B-C): in a zigzag, B retraces less than 100% of A and C ends beyond A; flats have B retracing most of A; triangles stay inside converging lines.

## Standard defaults
Degrees are labelled by style: the largest degree in Roman capitals, the middle in numbers or letters, the smallest in lowercase Roman. A drawing usually has a single degree.

## Reading it
Wave 3 gives the most information as it develops; wave 5 usually shows weaker momentum and volume. After a complete five waves expect an A-B-C correction against the trend. The frequent author warning is that the theory is subjective and counts change; ChartSchool states the guidelines may fail and need practice.

## Common mistakes and edge cases
- Labelling wave 1 from the first pivot instead of an origin: the origin point matters, since wave 1 is the leg from origin to point 1.
- Allowing wave 4 to overlap wave 1 in a "plain" impulse.
- Mixing degrees in one drawing.
- Using only one scale (linear or log) for long-term charts.
- Gaps and weekends do not affect structure but do affect any equal-time guideline.
- Very small waves: label collision.

## How OpenCandle does it
- Impulse uses six points (an unlabelled origin plus 1 to 5); the correction uses four (origin plus A to C).
- No rule checks or warnings, and only one wave degree.

## Open questions
- Whether OpenCandle enforces the rules (wave 2, 3, 4) or only draws.
- Whether the tool flags a failed rule or lets the user draw an invalid count.
- Whether OpenCandle's corrective tool distinguishes zigzag from flat labels.
- Book citations in the sources list are background reading and were not re-checked line by line.
