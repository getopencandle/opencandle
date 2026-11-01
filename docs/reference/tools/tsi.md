---
id: tsi
name: True strength index
kind: indicator
family: momentum
sources:
  - title: ChartSchool, True Strength Index
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/true-strength-index
    type: secondary
  - title: Momentum, Direction, and Divergence
    author: William Blau
    year: 1995
    url: book
    type: primary
confidence: medium
---

## Purpose
A momentum oscillator built from a double-smoothed price change, normalised by the double-smoothed absolute price change. It tracks price turns more closely than a single-smoothed momentum.

## How the author meant it to be used
William Blau introduced it in Stocks & Commodities magazine and later in his 1995 book; ChartSchool's account: the sign of TSI gives the bias (positive means bulls have the momentum edge, negative bears), the line can carry trend lines and support or resistance that are broken to give signals, and overbought and oversold levels depend on the security's volatility and on the lengths used (it shows 20/-20 for a (40,20,7) setting and 50/-50 for (13,7,7)). Signal-line crossovers are described as frequent and in need of filtering; divergences can mislead in a strong trend.

## How you interact with it
Automatic. Inputs: long length, short length, signal length and the price source. No placement. The value is known at the bar's close, and on the live bar it changes until close. Nothing is anchored, so there is no look-ahead.

## Calculation
PC = price minus prior price. First smoothing = EMA(PC, long); second = EMA of that, short. Same for |PC|. TSI = 100 x (double-smoothed PC) / (double-smoothed |PC|). The signal line is an EMA of TSI (ChartSchool: "simply an exponential moving average of TSI"). ChartSchool notes the EMAs start from a simple average and that more history is needed before values are true. Output lies between -100 and +100.

## Standard defaults
ChartSchool's worked example uses 25 and 13 for the two smoothings; its charts use (40,20,10) and (13,7,7), so signal length varies. OpenCandle defaults to 25 / 13 / 13 (the signal length of 13 is OpenCandle's own choice).

## Reading it
Centre-line cross is the "purest" signal per ChartSchool. Peaks and troughs in TSI often match price peaks and troughs, so trend lines drawn on TSI are valid. Overbought and oversold are not reversal signals by themselves; wait for confirmation.

## Common mistakes and edge cases
- Swapping the smoothings: the first uses the long period (25), the second the short (13).
- Computing TSI from price levels instead of changes.
- A perfectly flat market makes the denominator zero (no value).
- Different seeding produces different early values.
- Not to be confused with the Trend strength index (a correlation of price with bar index), a different indicator.

## How OpenCandle does it
- Includes a signal line. Defaults are 25 / 13 / 13 on the close (ChartSchool charts use a signal of 7 or 10).
- The long smoothing is applied first, then the short one, and all EMAs are seeded with a simple average.

## Open questions
Blau's own recommended lengths and signal length were not verified. Whether the first EMA in OpenCandle is seeded by a simple average (as ChartSchool describes) was not checked.
