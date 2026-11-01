---
id: autofibmulti
name: Auto Fibonacci multi-scale
kind: indicator
family: Fibonacci
sources:
  - title: ChartSchool, Fibonacci Retracements
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-retracements
    type: secondary
  - title: Technical Analysis of Stock Trends (retracement of one third to two thirds mentioned for secondary reactions)
    author: Robert D. Edwards and John Magee
    year: 1948
    url: book
    type: secondary
  - title: Technical Analysis of the Financial Markets
    author: John J. Murphy
    year: 1999
    url: book
    type: secondary
  - title: Elliott Wave Principle
    author: A. J. Frost and Robert Prechter
    year: 1978
    url: book
    type: secondary
confidence: low
---

## Purpose
Automatically draws Fibonacci retracement levels on the most recent swings at several scales (for example short, medium and long swing sizes) at once.

## How the author meant it to be used
Fibonacci retracements as used in markets are a practitioner convention, not from Fibonacci himself. ChartSchool explains that 61.8, 38.2 and 23.6 percent come from ratios between numbers in the Fibonacci sequence (13/21 near 0.618, 13/34 near 0.382, 13/55 near 0.236), that 1 - 0.618 = 0.382, and that the 50 percent level is not a Fibonacci number and stems from Dow Theory. It calls 61.8 and 38.2 the most popular levels, treats 23.6 as shallow, 38.2 to 50 as moderate and 61.8 as the golden retracement, and stresses these are alert zones, not hard reversal points, to be combined with candlesticks, patterns, oscillators or moving averages. Edwards and Magee, in their text, describe secondary reactions retracing typically from one third to two thirds of the prior move, which is the older source of the 38 to 62 percent zone. Secondary sources also credit Murphy with naming 38.2, 50 and 61.8 as the key set, and Frost and Prechter with tying these ratios to Elliott waves; those attributions are not confirmed. Several scales are a modern addition with no single author.

## How you interact with it
Automatic. The swings come from pivots, so you do not place the anchors. You can choose which scales and levels to show. Manual tools (drag two points) are the usual alternative. The swing at each scale is the highest high and lowest low of a rolling look-back, so the levels move as the extreme moves and jump when the start of the swing leaves the window.

## Calculation
At each scale the swing is the highest high and lowest low of the look-back (Short 50, Medium 150, Long 400 bars). The earlier of the two extremes is level 1 (A) and the later is level 0 (B), so level price = B - ratio * (B - A) for ratios 0.236, 0.382, 0.5, 0.618 (ChartSchool's four) and 0.786 (common practice, not in ChartSchool's set), plus 0 and 1. Direction is set by whether A is a low (up swing) or a high. Because the end follows the running extreme, the latest endpoint repaints. Extensions such as 1.272 and 1.618 are not part of this tool.

## Standard defaults
ChartSchool's tool shows 23.6, 38.2, 50 and 61.8 percent. 78.6 is a common addition. Scales have no authoritative default; OpenCandle shows Short 50, Medium 150 and Long 400 bars.

## Reading it
Pullbacks that hold in the 38.2 to 61.8 zone are read as moderate or golden retracements (ChartSchool). Confluence of levels from several scales is read as a stronger zone (a practitioner claim, not a tested rule). Levels give zones, not exact turning points.

## Common mistakes and edge cases
- Anchoring to the latest running extreme, which lets the levels jitter until the swing settles.
- Drawing from high to low inside an up swing (reversed direction).
- Log versus linear scale mismatch on large moves.
- Too many scales cluttering and producing spurious confluence.
- Swings detected on thin data at the start.

## How OpenCandle does it
- The swing at each scale is the highest high and lowest low of a rolling look-back (Short 50, Medium 150, Long 400 bars), not confirmed pivots. All three scales are shown by default.
- The earlier extreme is level 1 and the later is level 0, so the direction is right for both up and down swings.
- Levels are 0, 23.6, 38.2, 50, 61.8, 78.6 and 100. 78.6 is common practice rather than part of ChartSchool's set.
- The end of the swing follows the running extreme, and the swing jumps when its start leaves the look-back window.

## Open questions
The sources behind the multi-scale combination are not primary. Murphy and Frost/Prechter claims are unverified. Whether OpenCandle lets the user override detected anchors is unconfirmed.
