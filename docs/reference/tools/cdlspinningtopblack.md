---
id: cdlspinningtopblack
name: Spinning top black (neutral)
kind: pattern
family: candlestick indecision
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLSPINNINGTOP.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLSPINNINGTOP.c
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
A black candle with a small real body and shadows longer than the body, showing indecision.

## How the author meant it to be used
As the white spinning top (Nison, ChartSchool); the black body means the session closed slightly below its open. One after a long black candle can warn that a decline is slowing. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. Automatic; neutral.

## Calculation
Bar: black (close below open), non-doji body smaller than each shadow. TA-Lib reports -100 for a black body. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
No trend rule.

## Reading it
A caution flag.

## Common mistakes and edge cases
- As the white spinning top.

## How OpenCandle does it
- A black bar whose body is smaller than each shadow and is not a doji (body over 5% of the range). No average-body test is applied, unlike TA-Lib.
- Neutral: no trend is required and the mark carries no direction. It is shown when the pattern type is Both.
- The mark is drawn on the pattern's last bar and uses only that bar and the ones before it, so it never repaints once the bar has closed.

## Open questions
As the white spinning top.
