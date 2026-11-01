---
id: autofibext
name: Auto fib extension
kind: indicator
family: Fibonacci
sources:
  - title: Trend-based Fibonacci extension (common charting convention)
    author: no single author
    year: n/a
    url: n/a
    type: secondary
  - title: ChartSchool, Fibonacci Retracements
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-retracements
    type: secondary
confidence: low
---

## Purpose
Automatically takes the last three zig zag pivots (A, B, C) and projects Fibonacci multiples of the A-to-B move from C, to estimate where the next leg might reach.

## How the author meant it to be used
No single author. The trend-based extension is a common projection: a move from A to B, a retracement to C, and then targets at ratios of the A-B distance beyond C (typically 61.8, 100, 161.8, 261.8 percent). It is used as a profit-target map. ChartSchool is the source for the Fibonacci ratios.

## How you interact with it
Automatic. Inputs: deviation (3 percent), depth (10), same as Auto fib retracement. No placement. It repaints: the three newest completed pivots move when a new zig zag leg completes, and the levels then restart from the new C pivot and run to the newest bar. C counts as completed only once the zig zag has a later point, so nothing is drawn while the third leg is still forming.

## Calculation
Level = C + ratio x (B - A), ratios 0 to 4.236. If A to B is down then B - A is negative and the levels project downward from C; if up, upward. OpenCandle hides 3.618 and 4.236 by default.

## Standard defaults
OpenCandle-defined deviation 3, depth 10; default ratios in the level set up to 2.618 visible.

## Reading it
The 100 percent level (leg equal to A-B) and 161.8 are the classic targets; the extension has no confirmed forecasting power.

## Common mistakes and edge cases
- Starting from B instead of C.
- Wrong sign for down-moves.
- Using too few pivots: nothing should be drawn if there are fewer than three.
- Expecting levels to stay fixed as new pivots appear.

## How OpenCandle does it
- A, B and C are the three newest completed zig zag pivots; a pivot that is still forming is never used.
- Ratios run from 0 to 4.236, with 3.618 and 4.236 hidden by default. Direction follows the A to B move.
- Defaults are a 3% deviation and depth 10, the same as Auto fib retracement. The levels repaint when a new leg completes.

## Open questions
The exact ratio list, and whether the reference tool projects from C (as here) or uses another anchor, is unverified.
