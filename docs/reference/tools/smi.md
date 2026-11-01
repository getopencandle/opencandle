---
id: smi
name: Stochastic momentum index
kind: indicator
family: oscillator
sources:
  - title: The Stochastic Momentum Index, Technical Analysis of Stocks and Commodities
    author: William Blau
    year: 1993
    url: book
    type: primary
  - title: Momentum, Direction, and Divergence
    author: William Blau
    year: 1995
    url: book
    type: primary
confidence: low
---

## Purpose
A refinement of the stochastic oscillator that measures the close relative to the midpoint of the high-low range (not the low), double-smoothed, so it ranges from -100 to +100 and is smoother.

## How the author meant it to be used
William Blau introduced the SMI in S&C in 1993. The idea is that the close compared with the range midpoint carries direction better than the close compared with the low. Common practice: readings beyond +40 are overbought and below -40 oversold; a cross of the SMI with its signal EMA, a cross of zero, and divergence are signals.

## How you interact with it
Automatic, in its own pane. Set %K length, %D length and the EMA signal length. Nothing is placed. Values use current and earlier bars only; the live bar changes until close.

## Calculation
Using the %K-length window: HH = highest high, LL = lowest low, D = HH - LL, relative range R = close - (HH + LL) / 2. SMI = 200 x EMA(EMA(R, d)) / EMA(EMA(D, d)), a double EMA over the %D length. The signal is an EMA of the SMI. A zero double-smoothed range is undefined. The factor 200 (rather than 100) comes from using D/2 in the denominator.

## Standard defaults
%K 10, %D 3, signal EMA 3, levels +40 and -40 (OpenCandle's defaults). Blau also published other length sets.

## Reading it
Bounded oscillator; overbought and oversold exits, signal-line crosses and zero-line crosses are the usual triggers. Because of the double smoothing it lags the plain stochastic.

## Common mistakes and edge cases
- Using the close minus the low (plain stochastic) instead of the midpoint.
- Single instead of double smoothing.
- Leaving out the factor 200.
- Signal length versus %D length confusion.

## How OpenCandle does it
- Both smoothing stages are EMAs seeded with a simple average, and the signal is an EMA of the SMI.
- Defaults are %K 10, %D 3 and signal 3, with guide levels at +40 and -40. Blau also published other length sets.
- Scaled from -100 to +100 (the factor 200 above).

## Open questions
Defaults, level values and whether Blau's original uses EMA smoothing at both stages are from OpenCandle record, not from Blau's text.
