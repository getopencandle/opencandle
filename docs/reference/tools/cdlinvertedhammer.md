---
id: cdlinvertedhammer
name: Inverted hammer (bullish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLINVERTEDHAMMER.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLINVERTEDHAMMER.c
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
One-bar bullish reversal candidate after a decline: small body at the bottom of the range and a long upper shadow.

## How the author meant it to be used
Nison: after a downtrend, a small body at the lower end with an upper shadow at least about twice the body and little or no lower shadow. The rally failed to hold, so it looks bearish, but after a decline it warns that selling is losing force. He requires bullish confirmation the next session, ideally a gap up above the body. ChartSchool: a one-day bullish reversal that looks like an inverted lollipop. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the bar at its close; confirmation by the next bar is your judgement.

## Calculation
Bar: small real body; upper shadow at least 2 bodies; lower shadow at most about 10% of range; trend down. TA-Lib requires a short real body, long upper shadow, very short lower shadow, and a gap down (body below the previous body). TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
As the hammer, mirrored.

## Reading it
Needs confirmation; a gap-up next open is the textbook entry condition.

## Common mistakes and edge cases
- Confusing it with the shooting star: identical shape, different trend context.
- TA-Lib demands a body gap down; rules without a gap match more bars.
- The confirming bar is not part of the signal.

## How OpenCandle does it
- Upper shadow at least twice the body and lower shadow at most 10% of the range. No gap down is required (TA-Lib requires one), and there is no wait for the confirming bar.
- Needs a prior downtrend, otherwise the same shape is a shooting star.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).

## Open questions
Whether OpenCandle should require the gap; Nison calls it ideal, and sources differ on whether it is mandatory.
