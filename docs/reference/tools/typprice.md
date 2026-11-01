---
id: typprice
name: Typical price
kind: indicator
family: price transform
sources:
  - title: ChartSchool, Typical Price
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/typical-price
    type: secondary
  - title: TA-Lib TYPPRICE source, ta_TYPPRICE.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_TYPPRICE.c
    type: secondary
confidence: high
---

## Purpose
The average of a bar's high, low and close, plotted as a line. It is a single representative price per bar and the input to CCI, the Money Flow Index and VWAP.

## How the author meant it to be used
There is no single author; the term is a long-standing convention (some call it HLC3 or the pivot). ChartSchool presents it as a line on or under price whose trends and reversals are easier to see than on bars.

## How you interact with it
Automatic. No inputs in OpenCandle. Each bar's value is known when the bar closes, and the live bar's value moves as its high, low and close change.

## Calculation
(high + low + close) / 3. TA-Lib confirms exactly this. No smoothing and no warm-up: the first bar has a value.

## Standard defaults
No parameters. ChartSchool says its own charting tool shows a 14-period setting for this indicator, which suggests that version smooths the value; the plain definition and TA-Lib do not, and OpenCandle does not.

## Reading it
A smoother price line than the close alone because it includes the range. It is not a trading signal in itself.

## Common mistakes and edge cases
- Confusing it with median price (high + low) / 2 or average price (open + high + low + close) / 4.
- Including the open.
- A bar missing high, low or close has no value.

## Open questions
The ChartSchool mention of a 14-period setting is unexplained; OpenCandle follows the plain formula.
