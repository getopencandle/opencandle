---
id: chandekroll
name: Chande Kroll stop
kind: indicator
family: stops and volatility
sources:
  - title: The New Technical Trader
    author: Tushar Chande and Stanley Kroll
    year: 1994
    url: book
    type: primary
confidence: medium
---

## Purpose
A two-line volatility trailing stop built from ATR-offset extreme highs and lows, one line for long positions and one for short.

## How the author meant it to be used
Formulas as published: first high stop = highest high over p bars minus x times ATR(p). First low stop = lowest low over p bars plus x times ATR(p). Stop short = highest value of the first high stop over q bars. Stop long = lowest value of the first low stop over q bars. Author values p=10, x=1, q=9. A long is held while price stays above the stop line and exited when it closes below; shorts mirror.

## How you interact with it
Automatic; the stops are an indicator, not orders. Inputs: ATR length p, ATR coefficient x, stop length q. Values are known at bar close and, because the q-bar extreme is taken over past bars only, do not repaint once the bar closes.

## Calculation
As above. Naming oddity: the line labelled Stop Short is the q-bar highest of the high-based stop and sits above price in a downtrend; Stop Long is the q-bar lowest of the low-based stop and sits below price in an uptrend.

## Standard defaults
p 10, x 1, q 9.

## Reading it
Close above the Stop Short line suggests an uptrend; close below the Stop Long line suggests a downtrend. Between the two lines is a gray area.

## Common mistakes and edge cases
- Swapping which line is long versus short.
- Using an ATR of a different length than p.
- Forgetting the second stage (the q-bar extreme), which makes it a ratcheting stop.

## How OpenCandle does it
- Uses Wilder smoothing for ATR, over the ATR length.
- Defaults are the book values: ATR length 10, coefficient 1, stop length 9.
- Stop long (green) and Stop short (red) are named after the position each protects, so which one sits above price depends on the trend.

## Open questions
ATR smoothing used in the book (Wilder smoothing versus simple mean) is not verified.
