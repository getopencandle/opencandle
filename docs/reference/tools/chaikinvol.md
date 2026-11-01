---
id: chaikinvol
name: Chaikin volatility
kind: indicator
family: volatility
sources:
  - title: Chaikin Volatility
    author: Marc Chaikin
    year: n/a
    url: book
    type: primary
confidence: low
---

## Purpose
Gauges whether the trading range is expanding or contracting by taking the rate of change of a smoothed high-low range.

## How the author meant it to be used
Chaikin Volatility is the percentage change over N bars of a 10-period EMA of High minus Low. Chaikin's intent, as usually reported, is that sharp rises in volatility accompany market bottoms (panic) and a low or falling reading accompanies tops and complacent advances.

## How you interact with it
Automatic. Two inputs: EMA periods and rate-of-change lookback. Value known at bar close; early bars are unavailable until the EMA is seeded and the lookback is covered.

## Calculation
Range = high - low. Smoothed = EMA(range, 10). Chaikin Volatility = 100 x (Smoothed - Smoothed N bars ago) / Smoothed N bars ago, N = 10. OpenCandle seeds the EMA with an SMA; a zero earlier EMA makes the value unavailable.

## Standard defaults
10 and 10 (commonly cited).

## Reading it
Positive means the smoothed range is wider than N bars ago. Treat extremes relative to the symbol's own history.

## Common mistakes and edge cases
- Confusing it with standard-deviation volatility; it measures range change, not level.
- Using ATR (includes gaps) instead of high minus low changes the numbers.
- Some implementations omit the 100 scale.

## How OpenCandle does it
- Uses the plain high minus low of each bar, not the true range, so gaps are ignored.
- The 10-bar exponential average starts from a simple average. If the earlier average is zero, there is no value.
- Both periods default to 10, and a zero line is drawn.

## Open questions
Original smoothing choice and defaults are unverified. Gap handling (plain high-low versus true range) in Chaikin's version is unknown.
