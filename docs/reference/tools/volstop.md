---
id: volstop
name: Volatility stop
kind: indicator
family: trend / stop
sources:
  - title: New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: primary
  - title: ChartSchool, Chandelier Exit
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/chandelier-exit
    type: secondary
confidence: low
---

## Purpose
A trailing stop-and-reverse line placed a multiple of the average true range away from the most extreme price of the current trend. It trails price, flips when price closes beyond it, and always puts you in one of two states: uptrend (stop below price) or downtrend (stop above).

## How the author meant it to be used
Wilder's Volatility System in New Concepts (1978) places a stop and reverse at a "significant close" offset by a constant times ATR (ATR of 7 periods and a constant between 2.8 and 3.1). The usual description: for a long, the stop is the highest close since entry minus ATR x constant; when price closes below it the system reverses to short, with the stop above the lowest close. Secondary accounts of Wilder's system have the stop recomputed from the current ATR each bar, so it can move in either direction rather than ratcheting. The Chandelier Exit (ChartSchool) is a related but different tool: it hangs from the highest high of a longer window (22 by default) rather than the highest close since a flip.

## How you interact with it
Automatic. Inputs: Length (ATR), Source, Multiplier. No placement, nothing to drag. The stop value for a bar is known at that bar's close; on the live bar it can change until close and the trend can flip on the open bar and flip back. The first bar with an ATR value starts an uptrend by definition, so the first leg is arbitrary until the first reversal.

## Calculation
OpenCandle: ATR = Wilder's RMA of true range over Length. Track the extreme of the source in the current trend (highest for up, lowest for down). Up trend: stop = extreme - Multiplier x ATR; down trend: stop = extreme + Multiplier x ATR. If the new source value is beyond the previous bar's stop (below it in an uptrend, above in a downtrend), the trend flips and the extreme restarts at that value. Up stops and down stops are separate plots (cross markers), one visible per bar. Note: the stop is recalculated from the current ATR each bar and is not forced to ratchet monotonically, so it can retreat when ATR rises. This matches the usual accounts of Wilder's system.

## Standard defaults
Length 7 and Multiplier 3 (Wilder's ATR period and the middle of his constant range). The Source input (default close) is an OpenCandle addition.

## Reading it
Stop below price: long bias; stop above: short bias. A flip is a stop-and-reverse signal known at the close of the flip bar. Wider multipliers hold trends longer and give back more. It whipsaws in sideways markets.

## Common mistakes and edge cases
- Using the highest high instead of the highest close (source) when following Wilder.
- Forcing the stop to only ever move in the trend direction; the usual description has no ratchet.
- Flipping on the intrabar tick: use the bar close.
- Confusing with SuperTrend (uses median price plus ATR bands) or Chandelier Exit.
- First bars before the ATR is defined have no stop.

## How OpenCandle does it
- The stop is recomputed from the current ATR on every bar and is not forced to ratchet, so it can retreat when ATR rises. This matches the usual accounts of Wilder's system.
- The first trend is forced up (Wilder sets it from the day 8 close against the day 1 close).
- Defaults are length 7 and multiplier 3. The Source input (default close) is an OpenCandle addition.

## Open questions
Whether the flip compares with the previous bar's stop is unverified against the book.
