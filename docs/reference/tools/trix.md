---
id: trix
name: TRIX
kind: indicator
family: momentum
sources:
  - title: ChartSchool, TRIX
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/trix
    type: secondary
  - title: TA-Lib TRIX source, ta_TRIX.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_TRIX.c
    type: secondary
  - title: TRIX article in Technical Analysis of Stocks and Commodities
    author: Jack Hutson
    year: 1983
    url: book
    type: primary
confidence: medium
---

## Purpose
A momentum oscillator: the one-period percent rate of change of a triple exponentially smoothed moving average of the close. The triple smoothing is meant to remove minor price swings so only the larger momentum shifts show.

## How the author meant it to be used
Hutson, an editor of Technical Analysis of Stocks and Commodities, published it in the early 1980s (ChartSchool says "early 1980's"). ChartSchool describes the intended reading: TRIX is negative while the triple-smoothed average is falling and positive while it is rising, and it behaves like MACD, so the same three signals apply: signal-line crossovers (a 9-period EMA of TRIX), centre-line crossovers, and divergences. It adds that TRIX lags, so crossovers in quiet markets are late and can whipsaw.

## How you interact with it
Automatic. One input (Length). No placement, nothing to drag. The value on a bar is known at that bar's close (it uses only that bar and earlier ones), but on the live bar it moves with every tick until the bar closes. OpenCandle draws only the TRIX line and a zero guide; it has no signal line input, so a signal line would have to come from another indicator applied to it.

## Calculation
E1 = EMA(close, n); E2 = EMA(E1, n); E3 = EMA(E2, n). TRIX = 100 x (E3 - previous E3) / previous E3. ChartSchool says "1-period percent change in Triple-Smoothed EMA". TA-Lib computes (E3 / previous E3 - 1) x 100, which is identical. The EMA multiplier is 2 / (n + 1). Each EMA is seeded with a simple average of its first n inputs (this follows ChartSchool and TA-Lib; TA-Lib's lookback is three EMA lookbacks plus one for the rate of change), so the first valid TRIX value appears only after about 3 x (n - 1) + 2 bars. The x100 scale is the percent form; some tools scale by 10000, so absolute values differ between tools while the shape does not.

## Standard defaults
ChartSchool: 15 for the triple smoothing and 9 for the signal line, with 5 suggested for more sensitivity and 45 for less. TA-Lib's default is 30. OpenCandle uses 18 (its own choice).

## Reading it
Above zero: the triple-smoothed average is rising, momentum favours bulls. Below zero: falling. A cross of zero is a turn of the smoothed average. ChartSchool notes shorter lengths suit centre-line crossovers and longer ones suit signal-line crossovers, and that bearish divergences are unreliable while TRIX stays above zero in a strong uptrend (mirror for bullish).

## Common mistakes and edge cases
- Using the wrong scale (x100 vs x10000) when comparing with another tool.
- Seeding the EMAs from the first value instead of a simple average shifts early values; they converge later.
- Taking the percent change of price instead of of E3.
- A previous E3 of zero makes the ratio undefined.
- Expecting a default of 15 and finding 18.

## How OpenCandle does it
- Default length is 18 (ChartSchool uses 15 and TA-Lib 30).
- Draws the TRIX line and a zero guide only. There is no signal line input.
- Each EMA is seeded with a simple average, so the first value comes after about 3 x length - 1 bars.
- Uses the percent form (x100); some tools scale differently.

## Open questions
Whether Hutson's original scale and length were 15 and x100 could not be confirmed from the original article. No signal-line plot exists in OpenCandle.
