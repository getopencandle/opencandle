---
id: macddiv
name: MACD divergence
kind: indicator
family: signals
sources:
  - title: ChartSchool, MACD
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/macd-moving-average-convergence-divergence-oscillator
    type: secondary
  - title: MACD
    author: Wikipedia contributors
    year: n/a
    url: https://en.wikipedia.org/wiki/MACD
    type: secondary
  - title: TA-Lib MACD source, ta_MACD.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_MACD.c
    type: secondary
  - title: The Moving Average Convergence-Divergence Trading Method
    author: Gerald Appel
    year: 1979
    url: book
    type: primary
confidence: medium
---

## Purpose
Detects divergence between price swings and MACD swings: price makes a new extreme that MACD does not confirm.

## How the author meant it to be used
The account of Appel's work here comes from secondary sources. ChartSchool says Appel developed MACD in the late 1970s, and Wikipedia reports that Appel used "divergence" for the situation where the MACD line does not conform to price movement, for example a price low not matched by a MACD low. ChartSchool describes bearish divergence as a higher high in the security with a lower high in MACD (less upside momentum), and bullish as the mirror. It advises using closing prices for the price swings, since MACD is built from closes, and looking for clear reaction highs and lows in both. It adds that divergences are unreliable in strong trends (bearish ones are common in a strong uptrend) and are best confirmed by a signal line cross or support break. The name "divergence" for the MACD minus signal series is credited by Wikipedia to Thomas Aspray, so histogram and line divergence should not be mixed.


## How you interact with it
Automatic. It finds swing points itself; you adjust MACD lengths and swing sensitivity. Nothing is placed. Confirmed markers should not move once drawn.

## Calculation
MACD line = EMA(close, fast) - EMA(close, slow); signal = EMA(MACD, signal length); histogram = MACD - signal (ChartSchool). EMA seeding: a common method seeds each EMA with the simple average of its first N values, but the exact placement of the MACD seed has varied between TA-Lib versions and other tools, so early values differ. Swing highs and lows are pivots needing a number of bars on each side, so a pivot is known only after that many bars; marking it earlier is look-ahead. Divergence compares two consecutive same-side pivots in price against MACD (or histogram) values at the same bars. It is confirmed only when the second pivot is confirmed. A "forming" divergence that uses the unconfirmed latest bar can disappear.

## Standard defaults
12, 26, 9 on close (ChartSchool, Wikipedia). ChartSchool also mentions 5,35,5 as a more sensitive setting for weekly charts. The 19/39/9 set sometimes tied to Appel has no confirmed source and is not used here.

## Reading it
ChartSchool: lower highs in MACD against higher price highs show waning upside momentum, which can foreshadow a reversal, but a divergence is a warning, not a timing signal. Divergence with MACD still on the same side of zero means the trend side still has the momentum edge.

## Common mistakes and edge cases
- Comparing MACD at a different bar than the price pivot.
- Using an unconfirmed pivot (repaint).
- Mixing line and histogram divergences.
- EMA warm-up: early bars are unreliable; EMA seeding differs between tools.
- Intraday data across sessions changes the EMA.

## How OpenCandle does it
- Pivots are found on the MACD line (or histogram), 5 bars on each side, with the two pivots 5 to 60 bars apart. A divergence is confirmed only after the second pivot's right-hand bars close.
- Price is compared at the MACD pivot bars using wick highs and lows (or bodies with "Candle body only"), not closes as ChartSchool suggests.
- Line and histogram divergences are your choice and are never mixed.

## Open questions
Appel's own divergence rules and the 19/39/9 attribution have no confirmed source.
