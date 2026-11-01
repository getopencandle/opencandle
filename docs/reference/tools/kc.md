---
id: kc
name: Keltner channels
kind: indicator
family: volatility channel
sources:
  - title: How to Make Money in Commodities
    author: Chester W. Keltner
    year: 1960
    url: book
    type: primary
  - title: Keltner Channels
    author: StockCharts ChartSchool
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/keltner-channels
    type: secondary
confidence: high
---

## Purpose
Volatility envelope around a moving average, using average true range for width.

## How the author meant it to be used
Keltner (1960) introduced the "ten-day moving average trading rule": centre line is a 10-day simple average of the typical price (H + L + C) / 3, with a 10-day average of the high-low range added and subtracted. Linda Bradford Raschke (1980s) replaced this with a 20-period EMA centre and 2 x ATR(10) width, now the common form. Channel direction shows trend; a break above the upper line with an upturning channel may start an uptrend (and the reverse). In a flat channel, the lines act as overbought/oversold levels. ChartSchool says Keltner is smoother than Bollinger Bands because ATR varies less than standard deviation.

## How you interact with it
Automatic overlay. Inputs: length, multiplier, price source, exponential or simple centre, band style (average true range, true range, or high-low range) and ATR length. No placement. Known at bar close.

## Calculation
Raschke form: middle = EMA(20) of price; upper = middle + 2 x ATR(10); lower = middle - 2 x ATR(10). ATR is Wilder's smoothed true range. Keltner's original form: middle = SMA(10) of (H + L + C) / 3, offset = SMA(10) of (high - low).

## Standard defaults
20, multiplier 2, ATR length 10 (ChartSchool). The original used 10 with the range.

## Reading it
Moves outside the channel are relatively rare and signal strength or weakness; in ranges, touches signal reversals.

## Common mistakes and edge cases
- Confusing the two historical versions.
- ATR length independent of the EMA length (10 vs 20).
- Using standard deviation (that is Bollinger Bands).
- OpenCandle has older saved versions whose "use true range" setting maps to the band style option.

## How OpenCandle does it
- New instances use the Raschke form: a 20-bar EMA with 2 x Wilder ATR(10) bands, with the ATR length separate from the centre-line length.
- Charts saved earlier keep their old true-range setting at multiplier 1.
- "True range" and "Range" band styles average over the Length with the chosen average type. Range with Exponential off, source hlc3, length 10 and multiplier 1 reproduces Keltner's original.

## Open questions
None major.
