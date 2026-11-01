---
id: stochrsi
name: Stochastic RSI
kind: indicator
family: oscillator
sources:
  - title: The New Technical Trader
    author: Tushar Chande and Stanley Kroll
    year: 1994
    url: book
    type: primary
  - title: TA-Lib STOCHRSI source, ta_STOCHRSI.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_STOCHRSI.c
    type: secondary
  - title: ChartSchool, Stochastic Oscillator (for the underlying stochastic formula)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/stochastic-oscillator-fast-slow-and-full
    type: secondary
confidence: medium
---

## Purpose
Applies the stochastic formula to RSI values instead of price, making RSI more sensitive to where it sits in its own recent range. It reaches the extremes far more often than RSI does.

## How the author meant it to be used
Tushar Chande and Stanley Kroll introduced it in The New Technical Trader (1994). The purpose is to produce overbought and oversold readings when RSI itself is not yet at its classic 70 or 30 extremes, so it suits shorter-term timing and range-bound markets. The points here follow common practice and the formula sources.

## How you interact with it
Automatic, in its own pane. Set RSI length, stochastic length, K and D smoothing, and source. Nothing is placed. Values use current and earlier bars only; the live bar updates until close. Because three stages are chained (RSI, stochastic, smoothing) it needs a long warm-up.

## Calculation
RSI = Wilder RSI of the source over the RSI length. StochRSI raw = (RSI - lowest RSI) / (highest RSI - lowest RSI) over the stochastic length. Raw is a 0 to 1 ratio in the original; many tools multiply by 100. OpenCandle scales to 0-100, then %K = SMA(raw, K) and %D = SMA(%K, D). TA-Lib's STOCHRSI works the same way (RSI then STOCHF) and also reports fast %K and %D with a selectable MA type. A flat RSI window makes the ratio undefined.

## Standard defaults
RSI 14, stochastic 14, K 3, D 3, levels 80 and 20 (OpenCandle and TA-Lib's common use). Chande's original unsmoothed ratio used 0.8 and 0.2 on the 0 to 1 scale.

## Reading it
Above 80 is overbought, below 20 oversold, and crosses of K and D give timing. Because it is a second derivative of price it swings across its whole range quickly, so it is noisy; use a trend filter.

## Common mistakes and edge cases
- Scale confusion (0 to 1 versus 0 to 100).
- Using price instead of RSI in the stochastic window.
- Treating the unsmoothed ratio and the K/D smoothed lines as the same plot.
- A flat RSI window should be unavailable, not 0.

## How OpenCandle does it
- Scaled from 0 to 100, not 0 to 1 as in the original.
- A flat RSI window, or an RSI of 0 over 0, gives no value rather than 0.
- Defaults are RSI 14, stochastic 14, K 3 and D 3.

## Open questions
Chande and Kroll's exact original smoothing is not confirmed; the K/D smoothing is later common practice.
