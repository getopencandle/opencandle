---
id: cdlonneck
name: On neck (bearish)
kind: pattern
family: candlestick continuation
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLONNECK.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLONNECK.c
    type: secondary
  - title: Encyclopedia of Candlestick Charts
    author: Thomas N. Bulkowski
    year: 2008
    url: book
    type: secondary
confidence: medium
---

## Purpose
Two-bar bearish continuation: a long black bar, then a small white bar that opens lower and closes right at the prior low.

## How the author meant it to be used
Nison: in a downtrend a long black bar is followed by a white bar that opens with a gap down and rallies to close at or near the prior low. The failure to rally into the black body shows weakness; the white bar's low is resistance 'on the neck'. A close below the white bar's low is the continuation signal. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the second bar at its close. It is a continuation pattern, so a bearish mark in OpenCandle needs a prior downtrend.

## Calculation
Bar 1 black and long; bar 2 white, open below bar 1's low, close within 5% of bar 1's range of bar 1's low. TA-Lib allows a close slightly below or above the prior low within its equal margin (5% of range, 5-bar average). TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Match tolerance 5%.

## Reading it
Wait for price to fall below the white bar's low to confirm the downtrend continues.

## Common mistakes and edge cases
- Confusing it with the piercing line (closes well into the body) and the in-neck pattern (closes slightly inside).
- Requiring an exactly equal close.
- Reading it as a reversal.

## How OpenCandle does it
- Bar 2 must open below bar 1's low and close within 5% of bar 1's range of that low. TA-Lib measures the 5% against a 5-bar average range and also allows a close slightly below the low.
- As a continuation pattern it needs a prior downtrend.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
Where 'on neck' ends and 'in neck' begins; the sources disagree on the boundary.
