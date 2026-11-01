---
id: rsi
name: Relative Strength Index
kind: indicator
family: momentum
sources:
  - title: New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: primary
  - title: ChartSchool, Relative Strength Index
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-strength-index-rsi
    type: secondary
  - title: TA-Lib RSI source, ta_RSI.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_RSI.c
    type: secondary
confidence: high
---

## Purpose
A bounded 0 to 100 momentum oscillator comparing the size of recent gains with recent losses, to show overbought and oversold conditions and momentum shifts.

## How the author meant it to be used
Wilder (1978) listed five interpretations: tops and bottoms (above 70 and below 30), chart formations, failure swings, support and resistance, and divergence. The RSI tool in OpenCandle offers optional divergence marks; failure swings are a separate tool (see RSI failure swings). Wilder's point is that RSI levels near 70 or 30 flag extremes and the failure swing and divergence are the strong reversal signals. ChartSchool adds that in a strong uptrend RSI tends to stay between 40 and 90 with 40 to 50 as support, and in a downtrend between 10 and 60 with 50 to 60 as resistance; overbought can persist.

## How you interact with it
Automatic. You set the length, the source and the optional divergence marks. Nothing placed. Value is final at the bar close; the live bar moves. Wilder smoothing is recursive, so a value depends on all earlier history: starting the chart at a different bar changes early values slightly, converging after several multiples of the length.

## Calculation
Change = price - prior price; gain = max(change, 0), loss = max(-change, 0). First average gain and loss = simple mean of the first N. Then avg = (prior avg x (N - 1) + current) / N (Wilder smoothing, alpha 1/N). RS = avg gain / avg loss; RSI = 100 - 100 / (1 + RS). If avg loss is zero RSI is 100. TA-Lib follows the same method.

## Standard defaults
Length 14, levels 70 and 30 (Wilder; ChartSchool confirms). 

## Reading it
Overbought above 70, oversold below 30, centerline 50 as trend bias, divergences and failure swings for reversals.

## Common mistakes and edge cases
- Using a simple or exponential average (alpha 2/(N+1)) instead of Wilder's alpha 1/N.
- Starting the recursion at the wrong bar: the first value needs N changes, so N + 1 prices.
- Zero average loss (flat or rising only): RSI 100; both zero: undefined (TA-Lib returns 0).
- Treating 70 as an automatic sell in a strong trend.

## How OpenCandle does it
- Uses Wilder smoothing (alpha 1/N), starting from a simple average of the first N changes, so the first value appears after N + 1 prices. Default length is 14.
- If both average gain and average loss are zero, no value is shown (TA-Lib gives 0, some tools 100). If only the loss is zero, RSI is 100.
- Divergence marks are optional. Failure swings are a separate tool (RSI failure swings).

## Open questions
Handling of the both-zero case differs between tools; OpenCandle shows no value.
