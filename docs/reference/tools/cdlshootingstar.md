---
id: cdlshootingstar
name: Shooting star (bearish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLSHOOTINGSTAR.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLSHOOTINGSTAR.c
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
One-bar bearish reversal candidate after an advance: price rallies, then closes back near the open, leaving a small body at the bottom and a long upper shadow.

## How the author meant it to be used
Nison: after an uptrend, a small real body at the lower end of the range, an upper shadow at least about twice the body, and little or no lower shadow; the best examples gap up from the prior body (the 'star' position). Colour is secondary. The rally fails, showing buyers losing control. ChartSchool: opens higher, trades much higher, closes near the open; same shape as the inverted hammer but in an uptrend. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the bar at its close; no confirmation wait is built in.

## Calculation
Same shape as the inverted hammer, trend up. TA-Lib: short real body, long upper shadow, very short lower shadow, and the body gapping up from the previous real body. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Upper shadow at least 2 bodies; lower shadow at most 10% of range.

## Reading it
Bearish at the end of an advance, strongest with the gap and followed by a lower open or close.

## Common mistakes and edge cases
- Expecting a gap up from the prior body: Nison's best examples have one, but OpenCandle does not require it.
- Same shape as the inverted hammer.
- A tiny range in quiet markets produces many false matches.

## How OpenCandle does it
- Needs a clear prior uptrend (set by the trend rule): the bar before the pattern must be in an uptrend.
- Upper shadow at least 2 times the body, lower shadow at most 10% of the range, and not a doji. The shape is the same as the inverted hammer, so the trend decides the name.
- Does not require a gap up from the prior body. Nison calls the gap ideal but not part of the shape, and TA-Lib requires it, so OpenCandle reports more shooting stars than TA-Lib.
- The mark is drawn on the pattern's last bar and uses only that bar and the ones before it, so it never repaints once the bar has closed.

## Open questions
Whether the gap up from the prior body should be required (TA-Lib does).
