---
id: accelosc
name: Accelerator oscillator
kind: indicator
family: momentum (Bill Williams)
sources:
  - title: New Trading Dimensions
    author: Bill Williams
    year: 1998
    url: book
    type: primary
  - title: Trading Chaos
    author: Bill Williams
    year: 1995
    url: book
    type: primary
  - title: Broker and library descriptions of AC
    author: various
    year: n/a
    url: n/a
    type: secondary
confidence: medium
---

## Purpose
Measures the acceleration or deceleration of the Awesome oscillator, so a change in momentum shows before the Awesome oscillator itself turns.

## How the author meant it to be used
Williams's idea is that acceleration precedes momentum and momentum precedes price. The Accelerator (also called Acceleration/Deceleration) is an early warning and a confirmation filter for his other tools, not a stand-alone system. Published descriptions agree on the formula. Williams did not give a distinctive smoothing length for the AC, so the 5 is convention.

## How you interact with it
Automatic. Histogram in its own pane around zero; no inputs. Bars are green when higher than the previous bar and red when lower; an equal bar keeps the previous bar's colour. Final at the bar's close.

## Calculation
Median = (High + Low) / 2. AO = SMA(median, 5) - SMA(median, 34). AC = AO - SMA(AO, 5). The first value needs 34 + 4 = 38 bars.

## Standard defaults
5 and 34 for AO, 5 for the AO average.

## Reading it
Above zero with rising bars: momentum accelerating up. Below zero with falling bars: accelerating down. A change of colour shows deceleration and tends to come before the AO turns. It leads the AO and is noisier.

## Common mistakes and edge cases
- Using close instead of median price.
- Using exponential averages.
- Colouring by sign instead of by change from the previous bar.
- Equal consecutive values: the colour rule is a convention. Here an equal bar keeps the previous colour.

## How OpenCandle does it
- The lengths 5, 34 and 5 are fixed; there are no inputs.
- An equal bar keeps the previous bar's colour, and the first bar after a gap is coloured as falling. The Awesome oscillator uses the same rule. Williams only defines higher and lower bars.
- The first value appears on bar 38.

## Open questions
OpenCandle's colour rule for equal consecutive values is not confirmed from Williams.
