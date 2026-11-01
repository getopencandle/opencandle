---
id: uo
name: Ultimate oscillator
kind: indicator
family: momentum
sources:
  - title: The Ultimate Oscillator, Technical Analysis of Stocks and Commodities vol 3 no 4
    author: Larry Williams
    year: 1985
    url: book
    type: primary
  - title: ChartSchool, Ultimate Oscillator
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/ultimate-oscillator
    type: secondary
  - title: TA-Lib ULTOSC source, ta_ULTOSC.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_ULTOSC.c
    type: secondary
confidence: high
---

## Purpose
A bounded (0 to 100) momentum oscillator that blends buying pressure over three timeframes so that one short window does not dominate and produce false divergences.

## How the author meant it to be used
Williams developed it in 1976 and published it in 1985 (per ChartSchool). The design aim is to avoid the flaw of single-period oscillators that surge at the start of a trend and then diverge as it continues. His buy rule, as ChartSchool and the encyclopedia summaries give it, has three steps: (1) a bullish divergence, the oscillator making a higher low while price makes a lower low; (2) the low of that divergence is below 30; (3) the oscillator then rises above the high that sat between the two lows. The sell rule mirrors it: bearish divergence, divergence high above 70, then a fall below the low between the two highs. One secondary summary also lists exits (buy closed when UO passes 70, or after rising above 50 and falling back through 45); that is not in ChartSchool, so treat it as a secondary account.

## How you interact with it
Automatic. Three length inputs (fast, middle, slow). No placement. The line is known at each bar's close. The divergence signal needs two swings plus the break of the interim high, so it can only be seen after the fact; OpenCandle draws the oscillator only, not the signals.

## Calculation
BP = close - min(low, prior close). TR = max(high, prior close) - min(low, prior close). For each length n: A_n = sum of BP over n / sum of TR over n. UO = 100 x (4 x A_fast + 2 x A_middle + A_slow) / 7. ChartSchool and the TA-Lib source agree. TA-Lib sorts the three periods so the shortest gets weight 4, the middle 2, the longest 1, whatever order they are entered in. The first bar has no prior close, so the first value appears after the slowest length plus one bar. A window with zero total true range has no value.

## Standard defaults
7, 14, 28 with weights 4, 2, 1 (Williams; ChartSchool; TA-Lib; OpenCandle).

## Reading it
Centre line 50 is the bull/bear threshold per ChartSchool. Above 70 is overbought and below 30 oversold, but divergence rather than the level is the intended signal. ChartSchool says quiet securities may never reach 30 or 70 with 7/14/28 and suggests shorter settings such as 4/8/16; longer settings such as 20/40/80 suit trend bias from the 50 line.

## Common mistakes and edge cases
- Using close - low instead of close - min(low, prior close).
- Averaging the three ratios without the 4:2:1 weights or forgetting to divide by 7.
- Averaging per-bar ratios instead of dividing the window sums.
- Entering lengths out of order in other tools changes weights; OpenCandle assigns weights by input name (fast, middle, slow).

## How OpenCandle does it
- Weights follow the input slot (fast 4, middle 2, slow 1), not the sorted lengths as TA-Lib does. Keep fast shorter than middle and middle shorter than slow.
- Draws the oscillator only, not the divergence signals.
- Defaults are 7, 14 and 28.

## Open questions
OpenCandle weights by input slot (fast 4, middle 2, slow 1) and does not sort the lengths.
