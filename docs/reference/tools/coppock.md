---
id: coppock
name: Coppock curve
kind: indicator
family: momentum
sources:
  - title: Barron's article introducing the indicator
    author: Edwin Sedgwick Coppock
    year: 1962
    url: book
    type: primary
  - title: ChartSchool, Coppock Curve
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/coppock-curve
    type: secondary
confidence: medium
---

## Purpose
A long-term momentum indicator built to find major buying opportunities in broad equity indices after deep declines.

## How the author meant it to be used
ChartSchool: Coppock, an economist, introduced it in Barron's and designed it for monthly data on the S&P 500 and Dow Industrials. A buy signal is when it moves from negative into positive territory. Coppock used only buy signals; many analysts treat a cross from positive to negative as a sell. The 11 and 14 periods are said to come from the average mourning period. ChartSchool says the signals are best combined with other analysis, and that sell signals are less reliable than buys. ChartSchool also notes the indicator works on any timeframe, with many more signals on weekly data.

## How you interact with it
Automatic. Inputs: WMA length, long RoC length, short RoC length, source. Value known at bar close. On a non-monthly chart it is no longer the author's monthly tool, only the same formula.

## Calculation
Coppock = WMA(10) of ( RoC(14) + RoC(11)), where RoC is the percentage change versus N bars ago. The WMA weights the newest value 10 down to the oldest 1, divided by the sum of weights (55). A zero base for RoC makes the value unavailable.

## Standard defaults
WMA 10, RoC 14 and 11, on monthly data.

## Reading it
Buy: turns up through zero from below (ChartSchool describes the cross into positive territory). Some accounts instead describe a turn upward while still below zero; ChartSchool states the cross into positive territory, so that is the form used here.

## Common mistakes and edge cases
- Using a simple average instead of a weighted one for the smoothing.
- Using RoC as a ratio rather than percent (changes scale only, not sign).
- Treating signals on intraday charts as if validated by the author.

## How OpenCandle does it
- Publication year is taken as 1962 (Barron's), the majority date; ChartSchool's October 1965 is the outlier.
- Works on any chart interval, but the design is monthly; on other intervals it is the same formula, not the author's tool.
- The buy reading is the cross from negative into positive territory.
- A zero base for the rate of change makes the value unavailable.

## Open questions
Sources disagree on the publication year: 1962 is commonly cited, while ChartSchool gives October 1965.
