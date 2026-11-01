---
id: cdlharamibull
name: Harami (bullish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLHARAMI.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLHARAMI.c
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
Two-bar bullish reversal warning after a decline: a long black body followed by a small body contained inside it.

## How the author meant it to be used
Nison: harami is the Japanese word for pregnant. The first bar is a long body in the direction of the trend; the second real body is small and sits within the first body (the shadows may extend out). The second body's colour is not important, though opposite colour is the classic form. It says momentum has slowed; it is weaker than an engulfing pattern and usually needs follow-up. ChartSchool: a small body day completely contained within the previous body and of opposite colour. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the second bar at its close.

## Calculation
Bar 1 black with a long body; bar 2 a non-doji body no larger than the average body of the previous 14 bars and wholly inside bar 1's body; trend down. TA-Lib: first long, second short and engulfed by the first, +100 when the first bar is black, second body colour unrestricted. Whether touching body edges count as contained differs between rules. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Second body at most the average body of the previous 14 bars (OpenCandle).

## Reading it
A hint that the downtrend is pausing; look for a close above bar 1's open.

## Common mistakes and edge cases
- Requiring bar 2's whole range inside bar 1; Nison compares only the real bodies.
- Insisting on opposite colour (ChartSchool) when Nison allows either.
- Using it without a trend.

## How OpenCandle does it
- Bar 1 is a long black body. Bar 2 has a non-doji body no larger than the average body of the previous 14 bars, lying inside bar 1's body. Touching edges count as inside (TA-Lib scores that case lower), and bar 2 can be either colour.
- Only the real bodies are compared; bar 2's shadows may extend beyond bar 1.
- Needs a prior downtrend.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
Whether touching body edges count as contained.
