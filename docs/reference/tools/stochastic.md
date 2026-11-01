---
id: stochastic
name: Stochastic Oscillator
kind: indicator
family: oscillator
sources:
  - title: ChartSchool, Stochastic Oscillator (Fast, Slow, and Full)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/stochastic-oscillator-fast-slow-and-full
    type: secondary
  - title: George Lane's stochastics work (late 1950s onward)
    author: George C. Lane
    year: 1950s
    url: book
    type: primary
  - title: TA-Lib STOCH source, ta_STOCH.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_STOCH.c
    type: secondary
confidence: high
---

## Purpose
A bounded momentum oscillator showing where the close sits inside the recent high-low range.

## How the author meant it to be used
George Lane developed it in the late 1950s. ChartSchool quotes him: it does not follow price or volume but the speed or momentum of price, and momentum usually changes direction before price. Lane's first and most important signal was divergence (price makes a new extreme, the oscillator does not). He also used bull and bear set-ups: a bull set-up is a lower price high with a higher oscillator high, expecting the next decline to give a tradable low; a bear set-up is the mirror. In the fast version Lane used %D for signals and called a %D divergence the only signal that should make you buy or sell (per ChartSchool).

## How you interact with it
Automatic, in its own pane. Set the %K look-back, the %K smoothing and the %D length (and the 80/20 levels). Nothing is placed. A value uses the current and earlier bars only, so closed bars do not repaint; the live bar's value changes until it closes. Signals (crosses, exits from the zones) are known at the close of the bar where they occur.

## Calculation
Fast %K = 100 x (Close - Lowest Low) / (Highest High - Lowest Low) over N bars (highs and lows, not closes). Fast %D = 3-period SMA of Fast %K. Slow %K = Fast %K smoothed by a 3-period SMA, Slow %D = 3-period SMA of Slow %K. Full stochastic: %K smoothed with an X-period SMA and %D an X-period SMA of that. Fast (14,3), Slow (14,3) and Full (14,3,3) are the ChartSchool examples. A flat range (high equals low) leaves %K undefined; TA-Lib outputs 0 there while others leave it blank.

## Standard defaults
14-period look-back, 3 and 3 smoothing, overbought 80 and oversold 20 (ChartSchool). Full (20,5,5) or (10,3,3) are common sensitivity changes.

## Reading it
Above 50 the close is in the upper half of the range. Overbought is not automatically bearish: in a strong uptrend the oscillator can stay above 80; ChartSchool treats a move back below 80 as the signal. Crossings of %K and %D, moves through 20/80 and the 50 centerline are earlier but whipsaw-prone signals; divergence needs confirmation (a price support or resistance break, or a cross of 50).

## Common mistakes and edge cases
- Using closes instead of highs and lows for the range.
- Mixing up Fast, Slow and Full smoothing; the slow %K equals the fast %D.
- Treating 80/20 as automatic sell/buy.
- Flat-range division by zero.
- Smoothing with EMA instead of SMA changes the values.

## How OpenCandle does it
- The range uses highs and lows, and the smoothing is a simple moving average.
- New indicators default to 14 / 1 / 3 (a fast %K with a 3-bar %D). Charts saved earlier keep 14 / 3 / 3.
- There is no Fast, Slow or Full selector. The %K smoothing input gives the form: 1 is fast, 3 is slow, and larger values give a full stochastic.
- A flat range (high equals low) gives no value, where TA-Lib gives 0.

## Open questions
OpenCandle's defaults and whether it offers a type (fast/slow/full) selector were not confirmed in this pass.
