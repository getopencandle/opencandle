---
id: cdltristarbull
name: Tri-Star (bullish)
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
Three consecutive dojis where the middle one gaps below the other two, marking a bottom. Rare.

## How the author meant it to be used
Nison: three dojis in a row, the middle gapping away from the first and third (above at tops, below at bottoms). Because three dojis with a gap are rare, he treats it as a strong reversal signal. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the third bar at its close.

## Calculation
Three bars each with a doji body (at most 5% of range in OpenCandle); the middle body below both neighbours' bodies. TA-Lib: three dojis, the second gapping beyond the first's body and the third's body staying on the near side of the second. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Doji limit 5% (OpenCandle).

## Reading it
Rare reversal marker.

## Common mistakes and edge cases
- Treating three small ranges as dojis.
- Body gap versus shadow gap.
- Most matches in noisy data are not real examples.

## How OpenCandle does it
- Each of the three bars has a doji body, at most 5% of its own range, so quiet bars with tiny ranges can pass.
- The middle body must sit below both neighbouring bodies (a body gap, not a shadow gap). TA-Lib asks only that it gap from the first and that the third does not go past it.
- Needs a prior downtrend, read on the bar before the first doji.
- The mark is drawn on the pattern's last bar and uses only that bar and the ones before it, so it never repaints once the bar has closed.

## Open questions
The shadow-gap versus body-gap question is open.
