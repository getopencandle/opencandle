---
id: sma
name: Simple Moving Average
kind: indicator
family: moving average
sources:
  - title: ChartSchool, Moving Averages - Simple and Exponential
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-averages-simple-and-exponential
    type: secondary
  - title: TA-Lib SMA source, ta_SMA.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_SMA.c
    type: secondary
confidence: high
---

## Purpose
Smooths price by averaging the last N values equally, to show the underlying trend and act as dynamic support or resistance.

## How the author meant it to be used
There is no single inventor; the simple moving average is one of the oldest smoothing tools in charting. Common practice: price above a rising average is an uptrend, below a falling one a downtrend; a shorter average crossing a longer one signals a trend change; the average acts as support or resistance. ChartSchool notes that short averages (roughly 5 to 20 periods) suit short-term trends and longer ones suit longer trends.

## How you interact with it
Automatic overlay. You set length, source (usually close) and an optional display offset. Nothing is placed or anchored. The value on a bar uses only that bar and earlier bars, so it never repaints. A display offset only shifts the drawn line; it does not change the numbers.

## Calculation
SMA(t) = (x(t) + x(t-1) + ... + x(t-N+1)) / N. The first value appears on the Nth bar. TA-Lib computes it as a running sum (add the new value, drop the oldest), which gives the same result.

## Standard defaults
ChartSchool's overlay defaults to 50 periods for the SMA (20 for the EMA). In practice 20, 50 and 200 are the conventional trend lengths; the length is your choice.

## Reading it
Slope shows trend direction; price versus the average shows trend side; the 50/200 crossover is the widely cited long-term signal. An average lags by roughly half its length.

## Common mistakes and edge cases
- Showing values before N bars exist (should be blank).
- A missing value inside the window should make the result unavailable, not be treated as zero.
- Confusing display offset with a calculation change.
- Using a non-close source without labelling it.

## How OpenCandle does it
- Default length is 9, on the close.
- A missing value anywhere in the window makes the result unavailable instead of treating it as zero.
- The display offset only shifts the drawn line; it does not change the numbers.

## Open questions
OpenCandle's default length and source are not restated here.
