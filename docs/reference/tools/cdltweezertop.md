---
id: cdltweezertop
name: Tweezer top (bearish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: Encyclopedia of Candlestick Charts
    author: Thomas N. Bulkowski
    year: 2008
    url: book
    type: secondary
confidence: low
---

## Purpose
Two bars with matching highs during an advance, read as a ceiling tested twice.

## How the author meant it to be used
Mirror of the tweezer bottom (Nison): two bars sharing a high at the end of an advance. Strongest when a long white bar is followed by a black bar at the same high, or when the shared high is at known resistance. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the second bar at its close.

## Calculation
OpenCandle rule: two adjacent bars with highs equal within 5% of the larger range; trend up; colour ignored.

## Standard defaults
Tolerance 5% (OpenCandle).

## Reading it
Resistance tested twice.

## Common mistakes and edge cases
- As the tweezer bottom.

## How OpenCandle does it
- Two adjacent bars with highs within 5% of the larger of the two ranges. Bars a few positions apart do not count.
- Colour is not required. Needs a prior uptrend, read on the bar before the first of the two.
- The mark is drawn on the pattern's last bar and uses only that bar and the ones before it, so it never repaints once the bar has closed.

## Open questions
As the tweezer bottom.
