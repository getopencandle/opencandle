---
id: bop
name: Balance of power
kind: indicator
family: momentum
sources:
  - title: ChartSchool, Balance of Power
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/balance-of-power-bop
    type: secondary
  - title: Balance of Market Power, Technical Analysis of Stocks and Commodities (August 2001; ChartSchool spells the author Livshin in one place and Levshin in another)
    author: Igor Livshin
    year: 2001
    url: book
    type: primary
  - title: TA-Lib BOP source, ta_BOP.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_BOP.c
    type: secondary
confidence: medium
---

## Purpose
Compares the strength of buyers pushing price up with sellers pushing it down inside each bar, as a value from -1 to +1.

## How the author meant it to be used
ChartSchool says Igor Livshin introduced it in the August 2001 issue of Technical Analysis of Stocks & Commodities (also called Balance of Market Power). Positive values mean buyers dominate, negative sellers, near zero balance. Uses: zero-line crossovers as buy or sell signals, divergences with price, and overbought or oversold extremes judged against the security's own history. Livshin's original calculation was more complex; ChartSchool says it reduces to the simple form below.

## How you interact with it
Automatic. OpenCandle has no inputs and draws one line with a zero guide, showing the raw (unsmoothed) value. Known at the bar's close.

## Calculation
BOP = (Close - Open) / (High - Low). TA-Lib returns 0 when High - Low is not positive. ChartSchool and Livshin recommend smoothing this raw value with a 14-period simple average; raw BOP is choppy. OpenCandle shows the raw value; for a smoothed version, apply a moving average to it.

## Standard defaults
Smoothing 14-period SMA (Livshin, via ChartSchool). OpenCandle has no input.

## Reading it
Cross above zero: bullish; below: bearish. A move beyond the instrument's usual extreme suggests overbought or oversold. Do not rely on the crossing alone; confirm with volume or other indicators.

## Common mistakes and edge cases
- Dividing by zero on a flat bar.
- Forgetting that the raw value is unsmoothed, so it jumps bar to bar.
- Scaling: the value is a fraction of the bar's own range, so it is scale-free.
- Using it as the same thing as a candle body ratio when smoothing is applied.

## How OpenCandle does it
- A bar whose high equals its low has no value (TA-Lib returns 0 there).
- The value is raw and unsmoothed. Livshin and ChartSchool suggest a 14-period simple average, which OpenCandle does not apply.

## Open questions
Whether to expose the smoothing length as an input. The author's name spelling differs on the same ChartSchool page.
