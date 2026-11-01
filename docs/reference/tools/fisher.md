---
id: fisher
name: Fisher transform
kind: indicator
family: oscillator
sources:
  - title: Using the Fisher Transform
    author: John F. Ehlers
    year: 2002
    url: https://www.mesasoftware.com/papers/UsingTheFisherTransform.pdf
    type: primary
confidence: high
---

## Purpose
Turns a price normalised inside its recent range into an output with a roughly Gaussian distribution, so turning points are sharp and extremes are rare events.

## How the author meant it to be used
Ehlers argues prices are not Gaussian, so indicators built on that assumption round off at turns. The normalised price is pushed through y = 0.5 x ln((1 + x) / (1 - x)); near the middle the gain is about one, near the limits it is greatly amplified. He plots the Fisher line and the same line delayed one bar; the crossover of the two marks the cyclic turning point. He also shows crossing the Fisher line with ten times its rate of change (for a 10-bar channel) as a second turning-point method.

## How you interact with it
Automatic, in its own pane. You set only the length. No placement. The line and its trigger (the previous Fisher value) are known at each bar close; a crossover is known on the bar where the lines cross. Nothing repaints, but the output is recursive, so it depends on how much history precedes it.

## Calculation
Ehlers' EasyLanguage code: price = (H + L) / 2; MaxH and MinL = highest and lowest price over Len (10 in the paper). Value1 = 0.33 x 2 x ((price - MinL) / (MaxH - MinL) - 0.5) + 0.67 x Value1[1]. If Value1 > 0.99 it becomes 0.999; if < -0.99 it becomes -0.999 (the clamped value recurses). Fish = 0.5 x ln((1 + Value1) / (1 - Value1)) + 0.5 x Fish[1]. Plot Fish and Fish[1].

## Standard defaults
Length 10 in the paper (OpenCandle uses 9, an OpenCandle choice). The paper gives no guide levels; lines such as +/-1.5 are practitioner convention.

## Reading it
Fish crossing up through its one-bar-delayed value is a bullish turn; down through it is bearish. Large readings are rare by design, so extremes mark likely turns, but no numeric threshold is given.

## Common mistakes and edge cases
- Omitting the 0.5 x Fish[1] term or the 0.67 x Value1[1] term.
- Clamping to 0.99 instead of 0.999, or not recursing the clamped value.
- Dividing by zero in a flat window.
- Using close instead of (H + L) / 2.

## How OpenCandle does it
- Follows Ehlers' formula, including clamping before the recursion. Default length is 9 (the paper uses 10).
- A flat window counts as the midpoint, so the normalised value is zero.
- The guide lines at +1.5 and -1.5 are practitioner convention, not from the paper.

## Open questions
The paper does not say how to seed Value1 and Fish; OpenCandle starts both at 0 on the first full window.
