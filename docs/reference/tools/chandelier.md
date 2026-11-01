---
id: chandelier
name: Chandelier exit
kind: indicator
family: stops and volatility
sources:
  - title: ChartSchool, Chandelier Exit
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/chandelier-exit
    type: secondary
  - title: Chandelier exit as published by Charles Le Beau, featured in Elder's books
    author: Charles Le Beau
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
A volatility-based trailing stop that "hangs" from the highest high (longs) or lowest low (shorts) so a trend is not exited on ordinary pullbacks.

## How the author meant it to be used
ChartSchool, crediting Charles Le Beau and noting Alexander Elder featured it: long exit = highest high over 22 periods minus 3 x ATR(22); short exit = lowest low over 22 periods plus 3 x ATR(22). It keeps a trader in a trend as long as it extends. The long exit usually sits below price in an uptrend and the short exit above price in a downtrend. A decline strong enough to break the long exit warrants reevaluating longs; the short case mirrors. ChartSchool pairs it with a separate momentum trigger for entries.

## How you interact with it
Automatic; an indicator, not an order. Inputs: ATR period (22), multiplier (3), and a switch for using closes instead of highs/lows for the extremes. In OpenCandle the default uses closing prices for the extremes, the ratchet (a long stop does not fall while the trend holds), the direction switch and the Buy/Sell markers are OpenCandle-defined; ChartSchool's plain formula has none of these. Values are known at bar close.

## Calculation
Highest high (or lowest low) over N bars, offset by multiplier x ATR(N). ATR is Wilder's average true range (ChartSchool states the same period N is used for both the extreme and the ATR).

## Standard defaults
22 and 3 (22 is the approximate number of trading days in a month).

## Reading it
Close beyond the stop signals exit or reversal. The stop only protects in trends; in ranges it will whip.

## Common mistakes and edge cases
- Using one stop for both directions; there are two lines.
- Using a different period for ATR than for the extreme.
- Intrabar highs versus closes for the extreme gives different stops; ChartSchool uses highs and lows.
- Not ratcheting makes the stop drop when ATR expands.

## How OpenCandle does it
- By default the extreme highs and lows are taken from closing prices. LeBeau's published version uses the highest high and lowest low; untick "Use close price for extremums" to match it.
- ATR uses Wilder smoothing, with the same period as the extreme, as in the usual statement of the rule.
- The stop only ratchets: the long stop is not lowered while the previous close stays above it, and the short stop is not raised while the previous close stays below it.
- The direction turns up on a close above the previous short stop and down on a close below the previous long stop. Only the stop for the current direction is drawn, and the first bar starts up.
- Buy and Sell markers appear when the direction flips. They are an OpenCandle addition.

## Open questions

