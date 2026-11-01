---
id: cdlpiercing
name: Piercing (bullish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLPIERCING.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLPIERCING.c
    type: secondary
  - title: ChartSchool, Candlestick Pattern Dictionary
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary
    type: secondary
  - title: Encyclopedia of Candlestick Charts
    author: Thomas N. Bulkowski
    year: 2008
    url: book
    type: secondary
confidence: medium
---

## Purpose
Two-bar bullish reversal in a downtrend: a long black bar followed by a white bar that opens lower and closes above the middle of the black body.

## How the author meant it to be used
Nison: bar 1 is a long black body in a downtrend. Bar 2 gaps down, opening below the prior low, then closes well into the black body, at least to its midpoint but not beyond its open. Deeper penetration makes a reversal more likely; closing above the black open is closer to an engulfing pattern. ChartSchool: opens at a new low, then closes above the midpoint of the first day's body. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the second bar at its close.

## Calculation
Bar 1 black with a long body; bar 2 white, open below bar 1's low, close above the midpoint of bar 1's body and below its open; trend down. TA-Lib: bar 2 long white, open below bar 1's low, close at least 50% into bar 1's real body, and bar 2's close below bar 1's open (a close within the prior body), the same cap OpenCandle applies. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Midpoint rule at 50%.

## Reading it
Bullish reversal candidate; a close above the black open on the next bar adds weight.

## Common mistakes and edge cases
- Allowing an open at the prior close instead of below the prior low.
- Not capping the close below the prior open, which admits engulfing bars.
- Using 50% of the range instead of 50% of the body.

## How OpenCandle does it
- Bar 2 must open below bar 1's low and close above the midpoint of bar 1's body but below bar 1's open.
- OpenCandle does not require bar 2 to be a long body; TA-Lib does.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
Whether the cap at bar 1's open is needed; both OpenCandle and TA-Lib apply it.
