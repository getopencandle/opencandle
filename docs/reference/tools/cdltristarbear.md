---
id: cdltristarbear
name: Tri-Star (bearish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLTRISTAR.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLTRISTAR.c
    type: secondary
  - title: Encyclopedia of Candlestick Charts
    author: Thomas N. Bulkowski
    year: 2008
    url: book
    type: secondary
confidence: medium
---

## Purpose
Three consecutive dojis where the middle one gaps above the other two, marking a top. Rare.

## How the author meant it to be used
Mirror of the bullish tri-star (Nison). Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the third bar at its close.

## Calculation
Three doji bodies; the middle body above both neighbours.

## Standard defaults
As the bullish tri-star.

## Reading it
Rare top marker.

## Common mistakes and edge cases
- As the bullish tri-star.

## How OpenCandle does it
- Each of the three bars has a doji body, at most 5% of its own range.
- The middle body must sit above both neighbouring bodies. TA-Lib asks only that it gap from the first and that the third does not go past it.
- Needs a prior uptrend, read on the bar before the first doji.
- The mark is drawn on the pattern's last bar and uses only that bar and the ones before it, so it never repaints once the bar has closed.

## Open questions
As the bullish tri-star.
