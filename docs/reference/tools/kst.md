---
id: kst
name: Know sure thing
kind: indicator
family: momentum oscillator
sources:
  - title: Summed Rate of Change (KST)
    author: Martin J. Pring
    year: 1992
    url: book
    type: primary
  - title: Pring's Know Sure Thing (KST)
    author: StockCharts ChartSchool
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/prings-know-sure-thing-kst
    type: secondary
confidence: high
---

## Purpose
A momentum oscillator that blends four smoothed rates of change to capture several price cycles at once.

## How the author meant it to be used
Pring first described it in 1992 in Stocks & Commodities magazine. Use it like other unbounded oscillators: centreline crossovers (positive favours bulls), signal-line crossovers, divergences (only large obvious ones), and trend lines drawn on KST. ChartSchool calls centreline and signal-line crossovers the most robust. It has no fixed overbought or oversold levels. In strong trends a bearish signal cross may only show slowing momentum while KST stays positive.

## How you interact with it
Automatic, in its own pane. Inputs: four ROC lengths, four SMA lengths, signal length, source. Known at bar close; no repaint.

## Calculation
RCMA1 = SMA(ROC(10), 10); RCMA2 = SMA(ROC(15), 10); RCMA3 = SMA(ROC(20), 10); RCMA4 = SMA(ROC(30), 15). KST = 1 x RCMA1 + 2 x RCMA2 + 3 x RCMA3 + 4 x RCMA4. Signal = SMA(KST, 9). ROC is percent change over its length.

## Standard defaults
KST(10,15,20,30,10,10,10,15,9) for short-term daily. Pring's weekly set is (10,13,15,20,10,13,15,20,9), monthly (9,12,18,24,6,6,6,9,9).

## Reading it
KST above its signal line generally rising; centreline crosses lag more on weekly and monthly settings, so signal-line crosses are preferred there.

## Common mistakes and edge cases
- Weights run 1, 2, 3, 4 with the longest ROC weighted most.
- ROC must be percent, not price difference.
- Need about 45 bars before KST plus the signal line is defined.
- Pring suggests tuning settings by volatility of the instrument.

## Open questions
None significant.
