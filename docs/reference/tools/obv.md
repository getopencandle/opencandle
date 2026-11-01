---
id: obv
name: On Balance Volume
kind: indicator
family: volume
sources:
  - title: Granville's New Key to Stock Market Profits
    author: Joseph E. Granville
    year: 1963
    url: book
    type: primary
  - title: ChartSchool, On Balance Volume
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/on-balance-volume-obv
    type: secondary
  - title: TA-Lib OBV source, ta_OBV.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_OBV.c
    type: secondary
confidence: high
---

## Purpose
A running total of volume, added on up-close bars and subtracted on down-close bars, to show whether volume is flowing into or out of a security.

## How the author meant it to be used
Granville's idea (as relayed by ChartSchool): volume precedes price. OBV rises when up-day volume outpaces down-day volume and falls when down-day volume is stronger. Expect higher prices if OBV is rising while price is flat or falling, and lower prices if OBV is falling while price is flat or rising. The absolute value is meaningless; the shape matters: the trend of OBV, whether it matches price, and breaks of OBV support or resistance, which can lead price.

## How you interact with it
Automatic, no inputs. Needs volume. Value on a bar is known at that bar's close and does not change afterwards.

## Calculation
Close above prior close: OBV = prior OBV + volume. Close below: OBV = prior OBV - volume. Equal: unchanged. ChartSchool starts with the first period's signed volume; TA-Lib starts OBV at the first bar's volume (the first bar has no prior close, so it is not signed) and then applies the rule. These two starts differ by a constant offset, which does not affect shape, divergences or trend lines but does change absolute values.

## Standard defaults
No parameters.

## Reading it
Trend confirmation (OBV and price trending together), divergence (OBV makes a higher low while price makes a lower low, bullish; the reverse, bearish), and OBV breaking a trend line or prior high or low before price does. ChartSchool warns volume spikes can distort the line. A moving average is often overlaid.

## Common mistakes and edge cases
- Comparing close to open instead of to the prior close.
- Adding volume on an unchanged close.
- Comparing absolute OBV levels between starting dates; only the shape is comparable.
- Gaps in data or zero volume.

## How OpenCandle does it
- The first valid bar starts at 0. TA-Lib starts at the first bar's volume and ChartSchool at the signed first volume; the shape is the same, only the level is offset.
- Each bar is compared with the previous close, and an equal close adds nothing. A bar with a missing close or volume is blank, and the next bar carries on from the last valid one.

## Open questions
The start value is a convention; OpenCandle starts at zero, which only shifts the level.
