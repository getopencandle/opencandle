---
id: autopitchfork
name: Auto pitchfork
kind: indicator
family: pitchfork
sources:
  - title: Andrews' Pitchfork
    author: StockCharts
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/andrews-pitchfork
    type: secondary
  - title: Dr. Alan Andrews' Advanced Course (median line method)
    author: Alan H. Andrews
    year: 1960
    url: book
    type: primary
confidence: low
---

## Purpose
Automatically draws an Andrews pitchfork on the three newest completed zig zag pivots.

## How the author meant it to be used
Alan Andrews's median line method uses three alternating pivots; the median line runs from the first pivot through the midpoint of the other two, with parallels through those two. Price tends to return to the median line; outer lines act as support and resistance. See pitchfork.md for the full description of the manual tool. The automatic version is a convenience; no published source defines how pivots should be chosen automatically.

## How you interact with it
Automatic. Inputs: deviation (3 percent), depth (10). No placement and nothing to drag. It repaints: when a new zig zag leg completes, the pivots A, B, C change and the fork jumps. The median line starts at A, the two tines at B and C, and all extend to the newest bar. The upper line is the tine through the higher of B and C.

## Calculation
A, B, C are the last three completed zig zag pivots; C counts as completed only once a later zig zag point exists, so a pivot that is still forming is never used. Midpoint M of B and C (average of index and price). Slope = (M.price - A.price) / (M.index - A.index), measured in bars and in price units. OpenCandle builds the fork in linear price and bar index; it is not log-aware, so on a log-scale chart the lines look bent. Median line: from A at that slope. Upper and lower lines: same slope through B and C. Slope is in bar index, so weekends and gaps in the time axis are not counted.

## Standard defaults
Original (Andrews) fork; deviation 3 percent, depth 10 are OpenCandle's own.

## Reading it
See pitchfork.md: median line as a magnet, outer lines as support and resistance, breaks as warnings.

## Common mistakes and edge cases
- A must be the pivot before B and C in time; wrong ordering gives a distorted fork.
- Log scale: because the fork is built in linear price, it looks bent on a log chart.
- The fork changes after every new pivot, so it should not be used as a fixed level.
- Very small B-C gap makes the lines almost coincide.

## How OpenCandle does it
- Uses completed pivots only, so the fork does not anchor on a pivot that is still forming.
- Built in linear price and bar index, so on a log-scale chart the lines look bent. Gaps in the time axis (weekends) are not counted.
- Deviation 3% and depth 10 are the same as Auto fib retracement. The fork repaints when a new zig zag leg completes.

## Open questions
Automatic pivot selection has no external source.
