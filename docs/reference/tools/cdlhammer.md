---
id: cdlhammer
name: Hammer (bullish)
kind: pattern
family: candlestick reversal
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991
    url: book
    type: primary
  - title: TA-Lib source, ta_CDLHAMMER.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_CDLHAMMER.c
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
One-bar bullish reversal shape seen after a decline: price trades sharply lower, then recovers to close near the high, leaving a small real body at the top and a long lower shadow.

## How the author meant it to be used
Nison describes the hammer as a small real body at the upper end of the session range, a lower shadow at least about twice the height of the body, and little or no upper shadow. Body colour matters little (white is slightly more bullish). It is a hammer only in a downtrend; the same shape in an uptrend is a hanging man. It warns of a bottom and gains force if the next session confirms (opens or closes above the hammer's body). ChartSchool gives the same shape and the same trend rule. Nison's wording is paraphrased here.

## How you interact with it
Automatic. Nothing is placed or anchored by you. You choose the pattern direction (bullish, bearish or both) and how the prior trend is detected (price against a 50-bar average, 50 and 200-bar averages, or no detection). The mark is drawn on the bar that completes the pattern and is known only at that bar's close, so on the live bar it can appear or vanish until the bar closes. Once the bar is closed it does not repaint and never uses later bars. The mark sits on the hammer bar itself and appears at its close, before any confirmation. The tool does not wait for a confirming bar; Nison asks for one.

## Calculation
Bar conditions: small real body; lower shadow at least 2 times the body; upper shadow at most about 10% of the range (OpenCandle); prior trend down. TA-Lib's version needs a real body below the average body of the previous 10 bars, a lower shadow longer than the bar's own real body, an upper shadow under the very-short average, and the body's lower edge at or below the previous bar's low plus the near margin. TA-Lib does not test the trend. TA-Lib measures "long", "short", "doji", "very short shadow", "near" and "equal" against averages of the previous bars: body long or short = against the average real body of the previous 10 bars; doji = body at most 10% of the high-low range averaged over 10 bars; very short shadow = under 10% of the range average; near = 20% of range (5-bar average); equal = 5% of range (5-bar average). Marks need those prior bars, so none appear on the first bars of a chart.

## Standard defaults
Lower shadow at least 2 bodies; upper shadow at most 10% of range; trend rule SMA50 by default (the thresholds and the rule are OpenCandle's own choices).

## Reading it
After a clear decline it suggests sellers failed to hold the lows. A candidate, not a buy signal; sources note reversal rates are better with confirmation.

## Common mistakes and edge cases
- Calling the shape a hammer without a preceding downtrend (that is a hanging man).
- Requiring a white body; colour is secondary.
- A doji-like bar with a tiny body is accepted by some rules and rejected by others (OpenCandle excludes a doji).
- A zero-range bar has no shape and must not match.

## How OpenCandle does it
- Lower shadow at least twice the body, upper shadow at most 10% of the range, and a doji is excluded. TA-Lib is looser: its lower shadow only has to exceed the body, and it has no trend test.
- Needs a prior downtrend, otherwise the same shape is a hanging man.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears on the hammer bar itself when it closes. OpenCandle does not wait for the confirming bar Nison asks for.

## Open questions
Whether OpenCandle's 2-body and 10% thresholds match any published rule exactly (they are OpenCandle's choice).
