---
id: cdlkickingbear
name: Kicking (bearish)
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
A white marubozu followed by a black marubozu gapping down.

## How the author meant it to be used
Mirror of the bullish kicking; see Kicking (bullish). Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the second bar at its close.

## Calculation
Bar 1 white marubozu, bar 2 black marubozu, high of bar 2 below the low of bar 1.

## Standard defaults
As the bullish version.

## Reading it
Sharp bearish reversal of sentiment.

## Common mistakes and edge cases
- As the bullish version.

## How OpenCandle does it
- Each marubozu is a long body with shadows of at most 5% of its range. The gap is between the two bars' full ranges, not their bodies.
- No trend test applies, matching TA-Lib.
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
As the bullish version.
