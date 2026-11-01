---
id: cdlkickingbull
name: Kicking (bullish)
kind: pattern
family: candlestick reversal
sources:
  - title: TA-Lib source, ta_CDLKICKING.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLKICKING.c
    type: secondary
  - title: Encyclopedia of Candlestick Charts
    author: Thomas N. Bulkowski
    year: 2008
    url: book
    type: secondary
confidence: low
---

## Purpose
Two opposite marubozu with a gap between them; the bullish version is a black marubozu followed by a white marubozu gapping up.

## How the author meant it to be used
Kicking is not described in Nison's main text; it appears in later references such as Bulkowski. It shows a sudden reversal of sentiment and needs no trend context. TA-Lib implements it as two marubozu of opposite colour with a gap between ranges. ChartSchool does not list it. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the second bar at its close. No trend input applies.

## Calculation
Bar 1 black marubozu, bar 2 white marubozu, low of bar 2 above the high of bar 1. Each marubozu is a long body with shadows at most 5% of range (OpenCandle) or under the 10% very-short average (TA-Lib). TA-Lib takes the direction from the second bar's colour. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
As marubozu; no trend rule.

## Reading it
Sharp sentiment change; rare.

## Common mistakes and edge cases
- Measuring the gap on bodies instead of ranges.
- Treating it as trend-dependent.
- Rare; false positives on thin data.

## How OpenCandle does it
- Each marubozu is a long body with shadows of at most 5% of its range (TA-Lib allows slightly more). The gap is between the two bars' full ranges, not their bodies.
- No trend test applies, matching TA-Lib.
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
The pattern comes from later references rather than from Nison's main text.
