---
id: rvgi
name: Relative vigor index
kind: indicator
family: momentum / oscillator
sources:
  - title: The Relative Vigor Index, Technical Analysis of Stocks & Commodities, January 2002
    author: John F. Ehlers
    year: 2002
    url: https://traders.com/Documentation/FEEDbk_docs/2002/01/TradersTips/TradersTips.html
    type: primary
confidence: medium
---

## Purpose
An oscillator based on the idea that in an uptrend prices tend to close higher than they open, and in a downtrend lower, so the close-minus-open range relative to the high-low range measures conviction.

## How the author meant it to be used
Ehlers, January 2002. The line is compared with a signal line, and crossings of the two are the signals: RVI crossing above its signal is bullish, below is bearish. The formula, from secondary descriptions: numerator is a symmetric 1-2-2-1 weighted sum over four bars of close minus open, denominator the same weighting of high minus low, both then summed over a length and divided, with the signal line being a 1-2-2-1 weighted average of the RVI. Sources give slightly different constants.

## How you interact with it
Automatic. You set the length. Nothing placed. Everything uses the current and three prior bars plus the summation window; a crossing is known at the close of the bar where it occurs, and the current bar can flip it while forming.

## Calculation
num = ((C0-O0) + 2(C1-O1) + 2(C2-O2) + (C3-O3)) / 6; den = ((H0-L0) + 2(H1-L1) + 2(H2-L2) + (H3-L3)) / 6. RVGI = sum(num, N) / sum(den, N). Signal = (RVGI + 2 RVGI1 + 2 RVGI2 + RVGI3) / 6. The /6 cancels in the ratio but matters for the signal line weights. The sum denominator being zero gives no value.

## Standard defaults
Length 10 (Ehlers' default per secondary sources).

## Reading it
Signal-line crossovers; oscillates around zero, with no fixed overbought and oversold levels.

## Common mistakes and edge cases
- Dividing close-minus-open by high-low with no smoothing (a simplified version some sources give; not Ehlers').
- Using the weights 1-2-2-1 on the wrong ordering of bars (the newest and oldest get 1, the two middle get 2, so order does not matter, but the window must be 4 bars).
- Not smoothing the signal line.
- Needs 3 + N bars before the first value.

## How OpenCandle does it
- Uses Ehlers' formula (1-2-2-1 weighting for both the numerator and the signal line), default length 10.
- Labelled RVGI to keep it distinct from Dorsey's Relative volatility index (RVI).

## Open questions
Constants and the signal definition rest on secondary descriptions of Ehlers' article.
