---
id: cdlthreeblackcrows
name: Three black crows (bearish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDL3BLACKCROWS.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDL3BLACKCROWS.c
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
Three consecutive long black bars, each closing lower, marking a strong start to a decline.

## How the author meant it to be used
Nison: three black bodies, each opening within the prior body and closing at or near its low, appearing after an advance. ChartSchool: three consecutive long black bodies, each closing near its low and opening within the previous body. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the third bar at its close.

## Calculation
Three black bars; falling closes; each open inside the previous body; lower shadow at most 25% of range (OpenCandle) or very short (TA-Lib); TA-Lib also requires the first bar's close to be under the preceding white bar's high. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Lower shadow limit 25% (OpenCandle).

## Reading it
Strong bearish follow-through after a high.

## Common mistakes and edge cases
- Accepting opens below the prior close.
- Using it deep into a decline where it may be capitulation.

## How OpenCandle does it
- Each bar must have a long body (larger than the average body of the 14 bars before it) and a lower shadow of at most 25% of its range.
- Each open must be inside the previous body, edges included. TA-Lib's extra rule about the bar before the first crow is not used.
- Needs a prior uptrend, read on the bar before the first crow.
- The mark is drawn on the pattern's last bar and uses only that bar and the ones before it, so it never repaints once the bar has closed.

## Open questions
TA-Lib's extra condition on the bar before the first crow is not in OpenCandle's rule.
