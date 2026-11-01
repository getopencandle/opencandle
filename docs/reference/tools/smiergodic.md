---
id: smiergodic
name: SMI ergodic indicator/oscillator
kind: indicator
family: oscillator
sources:
  - title: Momentum, Direction, and Divergence
    author: William Blau
    year: 1995
    url: book
    type: primary
  - title: ChartSchool, True Strength Index (the same double-smoothed momentum construction)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/true-strength-index
    type: secondary
confidence: low
---

## Purpose
William Blau's ergodic indicator: double-smoothed momentum normalised by double-smoothed absolute momentum, giving a smooth line from -100 to +100 (some tools show -1 to +1) with a signal line and an oscillator (their difference).

## How the author meant it to be used
Blau's "ergodic" family (book, 1995) applies two exponential smoothings to momentum, which he argued gives direction and divergence signals with little noise. The indicator is the same construction as the true strength index. Typical use: the SMI line crossing its signal line, the zero line, and divergences against price. The oscillator (SMI minus signal) shows momentum of momentum. ChartSchool's TSI page documents the same construction.

## How you interact with it
Automatic, in its own pane, with three plots: SMI, signal, oscillator histogram. Set long length, short length, signal length and source. Nothing is placed. Values use current and earlier bars only.

## Calculation
Momentum m = source(t) - source(t-1). Double-smoothed numerator = EMA(EMA(m, long), short); denominator = EMA(EMA(|m|, long), short). SMI = 100 x numerator / denominator (OpenCandle); signal = EMA(SMI, signal length); oscillator = SMI - signal. The long EMA is applied first. EMAs are SMA-seeded in OpenCandle.

## Standard defaults
Long 20, short 5, signal 5 (OpenCandle's defaults), source close.

## Reading it
Zero line separates upward and downward momentum bias; signal crosses mark momentum turns; histogram growth means strengthening momentum.

## Common mistakes and edge cases
- Applying the short EMA first (order matters slightly).
- Forgetting the absolute value in the denominator.
- A zero denominator (flat prices) should be unavailable.
- Mixing up with the Stochastic momentum index, which uses high/low ranges.

## How OpenCandle does it
- Scaled to 100 (as Blau's TSI is), so the line runs from -100 to +100. Some tools use an unscaled -1 to +1 version.
- The long EMA is applied first, then the short one. All EMAs are seeded with a simple average, and the signal is an EMA of length 5.
- A flat market (zero denominator) gives no value.
- Defaults are 20, 5 and 5 on the close.

## Open questions
Exact Blau defaults and scaling (100 versus 1) were not verified from his text. The indicator and oscillator are one combined kind in OpenCandle; smiergodicosc is the oscillator alone.
