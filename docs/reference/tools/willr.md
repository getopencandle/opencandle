---
id: willr
name: Williams percent range
kind: indicator
family: momentum
sources:
  - title: How I Made One Million Dollars Last Year Trading Commodities
    author: Larry Williams
    year: 1973
    url: book
    type: primary
  - title: ChartSchool, Williams %R
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/williams-r
    type: secondary
  - title: TA-Lib WILLR source, ta_WILLR.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_WILLR.c
    type: secondary
confidence: high
---

## Purpose
Shows where the close sits within the highest-high to lowest-low range of the last N bars, on a scale from 0 (at the high) to -100 (at the low). It is the inverted fast stochastic.

## How the author meant it to be used
Larry Williams developed it. ChartSchool's account: -20 and above is overbought and -80 and below is oversold, but overbought is not necessarily bearish and oversold not necessarily bullish, since strong trends can stay at extremes. A move back below -50 after an overbought reading, or above -50 after an oversold one, confirms a turn. Momentum failure is a further signal: after repeated pushes above -20, a failure to get back above -20 followed by a drop below -50 shows weakening. A very long setting (125) can gauge the six-month trend: above -50 is above its six-month midpoint.

## How you interact with it
Automatic. Inputs: Length and Source (OpenCandle also lets you choose a source). No placement. The value is known at the bar's close; on the live bar it changes with the close until it ends. Guide lines at -20 and -80 are drawn with a shaded band.

## Calculation
%R = (highest high over N - close) / (highest high over N - lowest low over N) x -100. The window includes the current bar. ChartSchool and TA-Lib agree; TA-Lib returns 0 when the range is zero. Example from ChartSchool: high 110, low 100, close 108 gives -20; close 103 gives -70. The first value appears at bar N.

## Standard defaults
14 periods, levels -20 and -80 (ChartSchool, OpenCandle). TA-Lib requires N from 2 up.

## Reading it
Close at the top of the range reads near 0; at the bottom near -100; the midpoint -50 is the bull-bear line. ChartSchool also mentions a 3-day SMA as an optional signal line.

## Common mistakes and edge cases
- Using the wrong sign: values are negative.
- Using close-based extremes instead of highs and lows.
- Treating -20 and -80 as automatic sell and buy signals.
- Flat range (zero denominator) must not divide by zero.

## How OpenCandle does it
- A zero range gives no value, where TA-Lib gives 0.
- The Source input is an OpenCandle extension; the standard formula uses the close.

## Open questions
Williams' original period (the 1973 text) is unconfirmed; 14 is the modern default. The Source input is an OpenCandle extension: the standard formula uses the close.
