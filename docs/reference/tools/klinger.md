---
id: klinger
name: Klinger oscillator
kind: indicator
family: volume
sources:
  - title: Klinger Volume Oscillator documentation
    author: Wickra project, describing Stephen Klinger's method
    year: n/a
    url: https://docs.wickra.org/Indicators/Indicator-Kvo
    type: secondary
confidence: medium
---

## Purpose
Compares long and short-term money flow ("volume force") to show whether volume is supporting or fading a trend.

## How the author meant it to be used
Stephen Klinger's volume oscillator (published in Technical Analysis of Stocks & Commodities; the details below come from published implementation references). Volume force combines the day's trend direction, the bar's range relative to the range accumulated in the current trend, and volume. A fast EMA minus a slow EMA of that force gives the oscillator; a 13-period EMA signal line is used. Common reading: signal-line and zero-line crossings, and divergences from price.

## How you interact with it
Automatic, in its own pane; requires volume. Inputs: fast, slow, signal length. Known at bar close; recursive.

## Calculation
trend = +1 if H + L + C is above the prior bar's, -1 if below (a tie gives -1, the form used in the widely published formula and in OpenCandle). dm = H - L. cm = prior cm + dm while the trend is unchanged, otherwise prior dm + dm. VF = volume x |2 x (dm / cm - 1)| x trend x 100. KVO = EMA(VF, 34) - EMA(VF, 55); signal = EMA(KVO, 13). A zero cm gives VF = 0.

## Standard defaults
34, 55, 13.

## Reading it
KVO above zero means volume supports accumulation, below distribution. Signal-line crosses are the usual trade trigger; divergences are secondary.

## Common mistakes and edge cases
- Putting the minus one outside the absolute value: it is |2 x (dm / cm - 1)|.
- Starting cm from zero instead of the prior dm + dm at a trend flip.
- Equal H + L + C bars: tie handling differs between implementations.
- Platforms scale VF differently (x100 or not), changing the magnitude, not the shape.

## How OpenCandle does it
- Follows the published formula where the trend is +1 when H + L + C rises and -1 otherwise, so a tie counts as -1.
- A zero cumulative range gives no value, which the EMA skips rather than reading as 0. The EMAs are seeded with a simple average.

## Open questions
The original article's tie rule and scaling are not confirmed; confidence is medium.
