---
id: cdlmorningstar
name: Morning star (bullish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLMORNINGSTAR.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLMORNINGSTAR.c
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
Three-bar bullish bottom: a long black bar, a small star that gaps down, and a long white bar closing well into the black body.

## How the author meant it to be used
Nison: bar 1 is a long black body in a downtrend; bar 2 is a small real body (either colour) that gaps below bar 1's body; bar 3 is a white body that closes well into bar 1's body, ideally past the midpoint. The gap is between real bodies, not shadows. A deep third bar, a gap above the star, and rising volume strengthen it. ChartSchool: black, short gapped-down middle, and a white that closes above the midpoint of the first body. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the third bar at its close, the earliest the pattern exists.

## Calculation
Bar 1 black, long body; bar 2 small body (at most half the average body in OpenCandle, not a doji) wholly below bar 1's body; bar 3 white, close above the midpoint of bar 1's body (OpenCandle). TA-Lib: bar 1 long black, bar 2 a short body gapping down (body gap), bar 3 white with a close above bar 1's close by a penetration of 0.3 of bar 1's body (default 0.3, adjustable) and a body that is not short. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Penetration: midpoint in OpenCandle; 0.3 of bar 1's body in TA-Lib (Nison says 'well into', no exact value).

## Reading it
Bullish reversal candidate; one of the more reliable candle bottoms in Nison's text.

## Common mistakes and edge cases
- Requiring shadow gaps (that is the abandoned baby).
- Assuming one penetration level for all sources.
- Letting the star be a doji (that is the morning doji star).

## How OpenCandle does it
- The star is a small non-doji body (at most half the average body) that gaps below bar 1's body. A doji in the middle goes to Morning Doji star instead.
- Bar 3 must close above the midpoint of bar 1's body (TA-Lib uses a shallower 30% penetration). No gap between the star and bar 3 is required.
- A "long" body is larger than the average body of the previous 14 bars; a "small" body is at most half of that average; a doji body is at most 5% of its own range.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
The penetration level differs (50% OpenCandle, 30% TA-Lib).
