---
id: macd
name: MACD
kind: indicator
family: momentum oscillator
sources:
  - title: Technical Analysis: Power Tools for Active Investors
    author: Gerald Appel
    year: 2005
    url: book
    type: primary
  - title: MACD (Moving Average Convergence/Divergence) Oscillator
    author: StockCharts ChartSchool
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/macd-moving-average-convergence-divergence-oscillator
    type: secondary
confidence: high
---

## Purpose
Turns two moving averages into a momentum oscillator by subtracting the slower from the faster, with a signal line and histogram.

## How the author meant it to be used
Gerald Appel developed MACD in the late 1970s. ChartSchool describes the main signals: signal-line crossovers (bullish when MACD turns up through the signal line), centreline crossovers (the 12 EMA crossing the 26 EMA), and divergences with price. Crossovers at positive or negative extremes are less reliable; the MACD may remain positive through an extended trend.

## How you interact with it
Automatic, in its own pane. Inputs: fast, slow, signal length and source. Known at bar close; the open bar can cross back before it closes. OpenCandle also offers optional divergence markers using its own pivot rules; those confirm only after right-side bars.

## Calculation
MACD line = EMA(12) - EMA(26) of close. Signal = EMA(9) of MACD. Histogram = MACD - Signal. EMAs seeded with the SMA of the first n values (the common convention, TA-Lib).

## Standard defaults
12, 26, 9.

## Reading it
Positive means the fast EMA is above the slow one; histogram change shows momentum change before the lines cross.

## Common mistakes and edge cases
- Signal line is an EMA of MACD, not of price.
- Different EMA seeding gives start-up differences.
- TA-Lib's fixed 12/26 variant uses special constants (0.15, 0.075) and differs slightly.
- Histogram is the difference, not a separate smoothing.

## How OpenCandle does it
- Each EMA is seeded with a simple average of its own first window, so the MACD line starts at the 26th bar and the signal line 8 bars later.
- TA-Lib aligns the fast EMA's seed with the slow one, which changes start-up values only.

## Open questions
Appel's later suggested alternative settings (such as 19, 39, 9) are not examined here.
