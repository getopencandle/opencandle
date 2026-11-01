---
id: medprice
name: Median price
kind: indicator
family: price transform
sources:
  - title: Median Price
    author: StockCharts ChartSchool
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/median-price
    type: secondary
  - title: TA-Lib MEDPRICE, ta_MEDPRICE.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_MEDPRICE.c
    type: secondary
confidence: high
---

## Purpose
The midpoint of each bar's range.

## How the author meant it to be used
No single author. ChartSchool: median price = (High + Low) / 2, used as a cleaner picture of direction than the close, which is more affected by end-of-bar volatility. ChartSchool's "Median Price indicator" additionally smooths it with an SMA and compares it with the raw median price for crossovers. OpenCandle's tool plots only the raw per-bar median price (no smoothing).

## How you interact with it
Automatic overlay, no inputs. Known as soon as the bar has a high and low; on the open bar it changes with each tick.

## Calculation
Median price = (High + Low) / 2 per bar. The same value is sometimes called hl2.

## Standard defaults
None; no parameters.

## Reading it
A line between each bar's high and low. Comparing it with a moving average of itself gives crossovers (ChartSchool).

## Common mistakes and edge cases
- Confusing with the typical price (H + L + C) / 3 and weighted close.
- Confusing with the statistical median of a series.
- Open bars update continuously.

## Open questions
None.
