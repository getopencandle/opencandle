---
id: aroonosc
name: Aroon oscillator
kind: indicator
family: trend
sources:
  - title: ChartSchool, Aroon Oscillator
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/aroon-oscillator
    type: secondary
  - title: TA-Lib AROONOSC source, ta_AROONOSC.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_AROONOSC.c
    type: secondary
  - title: Aroon indicators
    author: Tushar Chande
    year: 1995
    url: book
    type: primary
confidence: medium
---

## Purpose
Collapses the two Aroon lines into one number, Aroon-Up minus Aroon-Down, so the trend bias reads as above or below a zero line.

## How the author meant it to be used
Same family as Aroon (Chande). ChartSchool: above zero means an upward bias (new highs more recent than new lows), below zero a downward bias; chartists may widen the threshold (for example +/-40 or more) for stronger signals. It reaches +100 only when Aroon-Up is 100 and Aroon-Down 0, which needs strong sustained movement.

## How you interact with it
Automatic. One input, length. Single line from -100 to +100, with a zero guide and guides at +90 and -90. Known at the bar's close; no repainting.

## Calculation
Aroon-Up = 100 x (N - bars since N-bar high) / N; Aroon-Down likewise for lows; oscillator = Up - Down. TA-Lib uses an N + 1 bar window and newest-wins ties, same as Aroon. Value +40 can come from many pairs (40/0, 60/20, 100/60 and so on).

## Standard defaults
ChartSchool: 25. OpenCandle's default is 14.

## Reading it
Zero crossings mark a change of bias; extremes near +/-100 show a strong trend; values hovering near zero show no trend. It always loses information about whether both lines are high or both low.

## Common mistakes and edge cases
- Window off by one (N versus N + 1 bars).
- Tie handling toward the oldest bar.
- Treating zero as neutral in a way that ignores that exactly equal Up and Down is possible.

## How OpenCandle does it
- Same window as Aroon: N + 1 bars, with ties going to the newest bar.
- Default length is 14 (Chande used 25).
- The guides at +90 and -90 are OpenCandle's own.

## Open questions
OpenCandle's default length and tie rule are not confirmed against TA-Lib.
