---
id: cdltweezerbottom
name: Tweezer bottom (bullish)
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
Two bars with matching lows during a decline, read as a floor tested twice.

## How the author meant it to be used
Nison describes tweezers as two or more bars sharing the same high (tops) or low (bottoms). They are not the strongest signals alone but matter when combined with other patterns, such as a long black bar followed by a white bar with the same low, or where the shared low sits at known support. Matching need not be exact. Nison's wording is paraphrased here. TA-Lib has no tweezer function, so the numeric rule is not standardised.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the second bar at its close.

## Calculation
OpenCandle rule: two consecutive bars whose lows agree within 5% of the larger range; colour not required; trend down. No published rule fixes the tolerance.

## Standard defaults
Tolerance 5% of the larger range (OpenCandle).

## Reading it
Support tested twice; stronger with a white second bar and confirmation.

## Common mistakes and edge cases
- Requiring identical lows to the tick.
- OpenCandle tests adjacent bars only; Nison's tweezers can be a few bars apart.
- Colour is not part of OpenCandle rule although Nison's best examples mix colours.

## How OpenCandle does it
- Two adjacent bars with lows within 5% of the larger of the two ranges. Bars a few positions apart do not count.
- Colour is not required. Needs a prior downtrend, read on the bar before the first of the two.
- The mark is drawn on the pattern's last bar and uses only that bar and the ones before it, so it never repaints once the bar has closed.

## Open questions
Tolerance and the adjacent-bar limit are OpenCandle's choices.
