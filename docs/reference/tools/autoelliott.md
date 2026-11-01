---
id: autoelliott
name: Auto Elliott waves
kind: indicator
family: Elliott wave
sources:
  - title: The Wave Principle / Elliott Wave Principle, Key to Market Behavior
    author: A. J. Frost and Robert Prechter (after R. N. Elliott)
    year: 1978
    url: book
    type: primary
  - title: ChartSchool, Introduction to Elliott Wave Theory
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/market-analysis/elliott-wave-analysis-articles/introduction-to-elliott-wave-theory
    type: secondary
  - title: ChartSchool, Identifying Elliott Wave Patterns
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/market-analysis/elliott-wave-analysis-articles/identifying-elliott-wave-patterns
    type: secondary
confidence: low
---

## Purpose
Automatically labels swings on the chart as a five-wave impulse (1 to 5) followed by a three-wave correction (A, B, C), following the basic Elliott rules.

## How the author meant it to be used
R. N. Elliott (1930s, popularised by Prechter in the 1970s per ChartSchool) held that markets move in repeating wave patterns on every scale. A motive wave advances in the trend direction in five waves (1, 3, 5 move with the trend; 2, 4 correct) followed by a three-wave correction, a 5-3 structure. Hard rules (ChartSchool): wave 2 never retraces 100 percent or more of wave 1; wave 3 is never the shortest of 1, 3 and 5 and goes beyond the end of wave 1; wave 4 never overlaps wave 1 (impulses; diagonals are exceptions). Guidelines like alternation, extensions and Fibonacci relations are judgement. Elliott counting is subjective by nature; there is no single objective algorithm and different analysts can label the same chart differently.

## How you interact with it
Automatic, visual only. Inputs: swing size (Small or Large), show corrective waves. It draws on the chart's own bars only (not another timeframe) and gives no values, so it cannot be alerted on. A swing is confirmed only with its full right side, so old swings do not repaint, and a swing that ends a drawn wave is frozen: a later more extreme pivot starts a new leg rather than moving the drawn endpoint. The newest swing and any wave still forming are unconfirmed. Only the newest 5000 bars are searched.

## Calculation
OpenCandle-defined, not Elliott's: pivots need a number of bars on each side (Small 5, Large 25) and an alternating zig-zag keeps a reversal only if it exceeds a multiple of ATR(14) (Small 2, Large 5). Waves are counted greedily from the oldest swing: the first six alternating swings satisfying the impulse rules are 0-1-2-3-4-5 (wave 5 must pass the end of wave 3); the next three swings form A-B-C when A goes against the impulse, B ends between the end of A and the end of the impulse, and C passes the end of A. Counting resumes after the last swing used.

## Standard defaults
Small swing size, corrective waves shown.

## Reading it
A completed 1-5 count suggests a trend phase and a possible correction; invalid counts are not drawn. Treat labels as one possible interpretation, not a forecast.

## Common mistakes and edge cases
- Treating the labels as confirmed when a later pivot can change the count.
- Allowing wave 4 to overlap wave 1 or wave 3 to be shortest.
- Counting both directions: bearish impulses mirror the rules.
- Greedy counting from the oldest swing means a different start gives a different count.

## How OpenCandle does it
- Pivots need their full right side, so confirmed swings do not repaint, and the endpoint of a drawn wave is frozen when new bars arrive.
- Only the newest 5000 bars are searched, and the window slides. Waves near its left edge can drop out or be recounted as bars arrive, so a drawn endpoint stays fixed only away from that edge.
- Swing size Small uses 5 bars each side and a reversal of 2 x ATR(14); Large uses 25 bars and 5 x ATR(14). Counting is greedy from the oldest swing.

## Open questions
No source defines the swing detection or the greedy counting; those are OpenCandle's own. Alternation, equality and Fibonacci guidelines are not enforced.
