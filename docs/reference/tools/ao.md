---
id: ao
name: Awesome oscillator
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
  - title: Broker and library descriptions of AO
    author: various
    year: n/a
    url: n/a
    type: secondary
confidence: medium
---

## Purpose
A momentum histogram comparing the recent market driving force (5-bar average of the median price) with the larger one (34 bars).

## How the author meant it to be used
Williams presents it as a measure of market driving force, comparing what is happening now with what happened over a larger window. Signals as usually described (published summaries list the same three): the saucer (zero line stays on one side, two bars of one colour then a bar of the other), the twin peaks (two highs or lows on the same side of zero, the second smaller, then a colour change) and the zero-line cross. He paired it with the Alligator and fractals as confirmation.

## How you interact with it
Automatic. No inputs; histogram in its own pane around zero. Known at the bar's close. Bars are green when higher than the previous bar and red when lower; an equal bar keeps the previous bar's colour.

## Calculation
Median price = (High + Low) / 2. AO = SMA(median, 5) - SMA(median, 34). Several independent descriptions agree on this, including a library page that attributes it to Williams.

## Standard defaults
5 and 34, simple averages, median price. Effectively fixed in practice.

## Reading it
Above zero: short-term momentum is above the longer term (bullish). Below zero: bearish. Zero crossings mark a change in dominance. Colour shows the bar-to-bar change, not the sign.

## Common mistakes and edge cases
- Using closes or exponential averages instead of simple averages of the median price.
- Colouring by sign instead of by change from the previous bar.
- The first 33 bars have no value.

## How OpenCandle does it
- The legend and data window label it AO.
- The periods 5 and 34 are fixed, on the median price.
- An equal bar keeps the previous bar's colour, and the first bar after a gap is coloured as falling, the same rule as the Accelerator oscillator. Williams only defines higher and lower bars.

## Open questions
The tie colour (equal to the previous bar). Whether OpenCandle draws the signals above (the base indicator does not).
