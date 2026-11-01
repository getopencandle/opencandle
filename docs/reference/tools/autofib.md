---
id: autofib
name: Auto fib retracement
kind: indicator
family: Fibonacci
sources:
  - title: ChartSchool, Fibonacci Retracements
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-retracements
    type: secondary
  - title: ChartSchool, ZigZag
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/zigzag
    type: secondary
confidence: medium
---

## Purpose
Automatically picks the latest completed swing and draws Fibonacci retracement levels across it, as support and resistance zones for a pullback.

## How the author meant it to be used
No single author for retracement levels; they come from Fibonacci ratios (ChartSchool: 61.8 percent, 38.2 percent and 23.6 percent derive from the sequence, and 50 percent comes from Dow Theory). After an advance, the levels are applied to the swing to mark where a correction may stop, and the reverse after a decline. ChartSchool says they are alert zones, not hard reversal points; confirm with candlesticks, patterns, oscillators or moving averages. Moderate pullbacks are 38.2 to 50 percent and 61.8 percent is the golden retracement.

## How you interact with it
Automatic. Inputs: deviation (percent, default 3), depth (10), reverse, swing mode (Zig zag or Lookback window), lookback window (150). No placement. Levels are plotted as lines from the swing start to the newest bar. They repaint: when a new zig zag leg completes, the swing and all levels move. ChartSchool notes the ZigZag has no predictive power because it draws in hindsight, so the last swing is only known after the reversal.

## Calculation
Swing = the latest completed zig zag leg (the one before the leg still forming; if only one leg exists, that leg). Level 0 sits at the swing end, level 1 at its start; Reverse swaps them. Level price = end + (start - end) x ratio. Levels: 0, 23.6, 38.2, 50, 61.8, 78.6, 100 percent. In Lookback mode the swing is the highest high and lowest low of the last N bars; the earlier extreme is the start.

## Standard defaults
OpenCandle-defined: 3 percent deviation, depth 10. ChartSchool's tool shows 23.6, 38.2, 50 and 61.8.

## Reading it
In an uptrend, retracements from the swing high down show where a pullback might stop; shallow (23.6) in strong trends, 61.8 in deep pullbacks.

## Common mistakes and edge cases
- Measuring from the wrong end: level 0 is at the end of the swing.
- Using close for the zig zag when highs and lows are meant.
- Expecting stability: levels change when a new leg completes.
- 78.6 percent is not in ChartSchool's list.

## How OpenCandle does it
- Level 0 sits at the swing end and level 1 at its start (Reverse swaps them). The swing is the latest completed zig zag leg, or the leg still forming if there is only one.
- Levels are drawn back from the swing start and repaint when a new leg completes. Alerts only use data available at each bar, so they do not repaint.
- Defaults are a 3% deviation and depth 10 for the zig zag, or a 150-bar look-back window in Lookback mode.

## Open questions
Reference swing detection and level set are unverified; OpenCandle's are its own definitions.
