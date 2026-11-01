---
id: cdlhangingman
name: Hanging man (bearish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLHANGINGMAN.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLHANGINGMAN.c
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
One-bar bearish warning: the hammer shape appearing after an advance.

## How the author meant it to be used
Nison: the hanging man has the hammer's shape (small body near the top, lower shadow at least about twice the body, little or no upper shadow) but occurs in an uptrend. The long lower shadow shows sellers pushed price down during the session, a first sign buyers are losing control. He stresses it needs bearish confirmation, in particular a lower open or close the next session, and that a black body is more bearish than a white one. ChartSchool describes the shape the same way. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the bar itself at its close. Confirmation is your job.

## Calculation
Same bar shape as the hammer, trend up. TA-Lib requires the body's lower edge at or above the previous bar's high minus the near margin (body near or above prior highs), plus small body, long lower shadow and very short upper shadow. It does not test the trend. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
As the hammer; trend rule SMA50.

## Reading it
Weak alone; Nison calls confirmation essential, and Bulkowski's statistics rate it poorly as a standalone reversal.

## Common mistakes and edge cases
- Treating it as a sell signal without confirmation.
- Identical shape to the hammer, so the trend test is the only difference; a wrong trend rule flips the label.
- A lower open or close next bar matters more than the bar itself.

## How OpenCandle does it
- The same bar shape as the hammer, but it needs a prior uptrend. TA-Lib also wants the body near or above the prior high and has no trend test; OpenCandle does not test the prior high.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the bar closes. OpenCandle does not wait for the lower open or close that Nison asks for.

## Open questions
Whether OpenCandle should require confirmation.
