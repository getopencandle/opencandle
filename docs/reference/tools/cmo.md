---
id: cmo
name: Chande momentum oscillator
kind: indicator
family: momentum
sources:
  - title: The New Technical Trader
    author: Tushar Chande and Stanley Kroll
    year: 1994
    url: book
    type: primary
  - title: TA-Lib CMO source, ta_CMO.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CMO.c
    type: secondary
confidence: medium
---

## Purpose
A momentum oscillator that uses both up and down price changes in the numerator, bounded between -100 and +100, so it reaches extremes more cleanly than RSI-style ratios.

## How the author meant it to be used
Chande defines CMO as 100 x (Su - Sd) / (Su + Sd), where Su is the sum of up-day close changes and Sd the sum of the absolute down-day changes over the period. Readings above about +50 are treated as overbought and below -50 as oversold; trend traders may use zero crossings or a signal average, and Chande also described using it to measure trend strength via its absolute value.

## How you interact with it
Automatic. Inputs are length and source. Value known at bar close, needs N+1 bars (N changes).

## Calculation
Two variants exist, and they differ numerically. Chande's published form (and OpenCandle) uses plain sums over the last N changes, so the window slides and old changes drop out completely. TA-Lib instead seeds with the sum over N changes and then applies Wilder smoothing (average gain = (previous x (N-1) + current) / N, similarly loss) and outputs 100 x (gain - loss) / (gain + loss); this is the same smoothing RSI uses and effectively makes CMO a rescaled RSI: CMO = 2 x RSI - 100 for that variant. Sums-based CMO is not a rescaled RSI.

## Standard defaults
Chande's examples use 20; TA-Lib defaults to 14; OpenCandle default is 9. Check which is expected before comparing.

## Reading it
Above +50 overbought, below -50 oversold (Chande's levels, as usually quoted). A window with no net change at all gives an undefined 0/0, which OpenCandle leaves unavailable.

## Common mistakes and edge cases
- Mixing the sums variant with the Wilder-smoothed variant when comparing with other software.
- Treating the zero window as zero rather than undefined.
- First value needs N changes, so N+1 bars.

## How OpenCandle does it
- Uses Chande's plain sums over the last N changes, not the Wilder-smoothed version some libraries use, so it is not a rescaled RSI.
- Default length is 9 (Chande's examples use 20, TA-Lib 14).
- A window with no net change shows no value rather than zero.

## Open questions
Chande's book default length and exact overbought level are unclear. Which variant a given outside reference uses is not always stated.
