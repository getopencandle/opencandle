---
id: cdllonguppershadow
name: Long upper shadow (bearish)
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
A one-bar shape with an upper shadow that fills most of the range, read as rejection of higher prices.

## How the author meant it to be used
Generic shape, not a named Nison pattern. ChartSchool's Long Shadows entry says a long upper shadow with a short lower shadow means buyers dominated early and then lost control. Nison's shooting star and inverted hammer are the named cases with a small body at the bottom. No author gives a numeric threshold. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. Automatic; the 'bearish' label is OpenCandle's choice.

## Calculation
OpenCandle rule: the upper shadow is at least two thirds of the range (OpenCandle's own choice).

## Standard defaults
Upper shadow at least 2/3 of range (OpenCandle).

## Reading it
A hint of rejection at the high.

## Common mistakes and edge cases
- Treating it as a signal alone.
- A thin opening print.

## How OpenCandle does it
- This is OpenCandle's own rule, not a published pattern: the upper shadow must be at least two thirds of the bar's range.
- The bearish label applies when the shape follows an advance.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).

## Open questions
No primary threshold exists.
