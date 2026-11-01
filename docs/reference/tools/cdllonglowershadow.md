---
id: cdllonglowershadow
name: Long lower shadow (bullish)
kind: pattern
family: candlestick shadow
sources:
  - title: ChartSchool, Candlestick Pattern Dictionary
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary
    type: secondary
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
confidence: low
---

## Purpose
A one-bar shape with a lower shadow that fills most of the range, read as rejection of lower prices.

## How the author meant it to be used
This is a generic shape, not a named Nison pattern. ChartSchool's Long Shadows entry says long lower shadows with short upper shadows mean sellers dominated early and drove price down, then lost it. Nison's hammer and hanging man are the named cases with a small body at the top. No author gives a numeric threshold for a plain long lower shadow. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. Automatic; the mark sits on the bar at its close. The 'bullish' label is OpenCandle's choice when the shape follows a decline.

## Calculation
OpenCandle rule: the lower shadow is at least two thirds of the high-low range. That threshold is OpenCandle's own choice, not a published standard.

## Standard defaults
Lower shadow at least 2/3 of range (OpenCandle).

## Reading it
A hint of rejection at the low; read with trend and volume.

## Common mistakes and edge cases
- Treating it as a reversal confirmation on its own.
- Shadow measured against the body versus against the range gives different matches.
- A thin first print can create a long shadow.

## How OpenCandle does it
- This is OpenCandle's own rule, not a published pattern: the lower shadow must be at least two thirds of the bar's range.
- The bullish label applies when the shape follows a decline.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).

## Open questions
No primary threshold exists; the whole rule is OpenCandle's choice.
