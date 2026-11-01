---
id: mfi
name: Money flow index
kind: indicator
family: volume oscillator
sources:
  - title: Money Flow Index
    author: StockCharts ChartSchool, describing Gene Quong and Avrum Soudack's indicator
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/money-flow-index-mfi
    type: secondary
  - title: TA-Lib MFI, ta_MFI.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_MFI.c
    type: secondary
confidence: high
---

## Purpose
A volume-weighted RSI that measures buying and selling pressure on a 0 to 100 scale.

## How the author meant it to be used
Created by Gene Quong and Avrum Soudack. ChartSchool lists their three signals: overbought/oversold (above 80, below 20; the creators suggested using 90 and 10 as stronger extremes in strong trends), bullish and bearish divergences, and failure swings at 80 or 20. A bullish failure swing: MFI falls below 20, rises above 20, holds above 20 on a pullback, then breaks its prior reaction high. Bearish is the mirror. Extremes alone are not enough; wait for a reversal confirmation.

## How you interact with it
Automatic, in its own pane; needs volume. Input: length. Known at bar close. A failure swing is known only on the bar that breaks the reaction point.

## Calculation
Typical price = (H + L + C) / 3. Raw money flow = typical price x volume. It is positive if the typical price rose from the prior bar, negative if it fell; bars with an unchanged typical price are excluded. Money flow ratio = (14-bar sum of positive flow) / (14-bar sum of negative flow). MFI = 100 - 100 / (1 + ratio), equal to 100 x positive / (positive + negative). TA-Lib returns 0 when the total is 0.

## Standard defaults
14; levels 80 and 20 (90 and 10 for extremes).

## Reading it
Overbought/oversold, divergence and failure swings. ChartSchool says the 50 centreline is not ideal for bias.

## Common mistakes and edge cases
- Using close instead of typical price for the direction test.
- Counting unchanged-typical-price bars in either sum.
- All-zero flow: TA-Lib outputs 0, others differ.
- Zero-volume bars add nothing.

## How OpenCandle does it
- Direction comes from the typical price. Bars where it is unchanged add to neither sum.
- If total flow is zero, no value is shown (TA-Lib returns 0).
- Default length is 14.

## Open questions
None major.
