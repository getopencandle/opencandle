---
id: dicross
name: DI cross signals
kind: indicator
family: signals
sources:
  - title: New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: primary
  - title: ChartSchool, Average Directional Index
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-directional-index-adx
    type: secondary
  - title: TA-Lib PLUS_DI source, ta_PLUS_DI.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_PLUS_DI.c
    type: secondary
confidence: high
---

## Purpose
Flags the bars where the Positive Directional Indicator (+DI) crosses the Negative Directional Indicator (-DI), the basic entry signal of Wilder's Directional Movement System.

## How the author meant it to be used
Wilder's text: when +DI14 crosses above -DI14 a long position is taken, and the position is reversed when -DI14 crosses above +DI14. It is an always-in-the-market reversal system, best traded on markets that rank high on his commercial selection index. His rule of thumb: the system should be profitable on markets with an ADXR above 25, and when ADXR drops below 20 a trend-following system should not be used (he points to other systems in the book for those markets).

The Extreme Point Rule is a reverse point, not an entry filter. In Wilder's words, on the day the two indicators cross, the extreme price made that day is the reverse point: if long, it is the low of the crossing day; if short, the high of the crossing day. He says to stay with this point, if not stopped out, even if the indexes stay crossed against the position for several days. He observes that this extreme price often is not penetrated again and the market turns back in the direction of the open position. The widely repeated phrasing (act only when later price takes out the cross-day high or low) is therefore not Wilder's formulation. ChartSchool's version matches his: the initial stop is the signal-day low for a buy and the signal-day high for a sell, and the signal stays in force while that level holds.

## How you interact with it
Automatic. Inputs: DI length and ADX smoothing (both 14), a trend filter (ADXR by default, or ADX, or Off) with its threshold (25 by default), "Show extreme point (stop)" (on) and "Reverse at extreme point" (off). No placement. The signal is on the crossing bar itself. Wilder's extreme point is drawn as a stop level on the price chart from that bar, and a "Stop" mark appears on the bar that takes it out.

## Calculation
Up move = high - prior high; down move = prior low - low. +DM = up move if up move > down move and > 0, else 0; -DM = down move if down move > up move and > 0, else 0. True range = max(high - low, |high - prior close|, |low - prior close|). Smooth +DM, -DM and TR with Wilder smoothing: the first value is the sum of the first N one-bar values; afterward S = S_prev - S_prev/N + current (ChartSchool). TA-Lib's comments describe the same method and note the first bar has no DM, so the first sum covers 13 DM values for N = 14 (a small start-up difference between sources). +DI = 100 * smoothed +DM / smoothed TR; -DI likewise. Wilder's book rounded values for hand calculation; TA-Lib does not. A bullish cross is +DI > -DI now and +DI <= -DI on the previous bar (mirror for bearish). It is known at the bar close. ADXR = (ADX + the ADX from ADX smoothing - 1 bars earlier) / 2. The trend filter is checked on the crossing bar: a cross below the threshold gives no signal and no level.

Extreme point: from a qualifying cross, the level is that bar's low after a bullish cross and its high after a bearish cross. It holds until a later low falls below it (or a later high rises above it), which is the "Stop" bar, or until the next qualifying cross sets a new level. ChartSchool notes that around 150 bars are needed before the smoothed values settle. Plain moving-average smoothing is a deviation from Wilder.

## Standard defaults
14 periods (Wilder, per ChartSchool). Trend filter ADXR at 25 (Wilder trades above 25 and avoids below 20). ChartSchool reports Wilder's ADX levels as strong trend above 25 and no trend below 20, with many analysts using 20. Shorter periods for intraday use are secondary practice.

## Reading it
A cross is a candidate, not a command. Wilder pairs it with ADXR for trend strength and with the extreme point rule for the reverse point, which is the stop level drawn on the price chart. Frequent crosses with low ADX mean a range. ChartSchool notes whipsaws are normal and signals should be read with other analysis.

## Common mistakes and edge cases
- Treating every cross as tradable; most in a range are noise.
- Describing the extreme point rule as an entry trigger; in Wilder's text it is the reverse (stop) point, and the signal is the cross bar itself.
- Counting a flat touch (equality) as a cross both ways.
- Zero true range bars and missing high/low data.
- Using the live bar: DI values can cross and un-cross intrabar.
- Gaps are handled by true range but also inflate DM.

## How OpenCandle does it
- Signals on the cross bar itself, not on a later bar that takes out the cross-day high or low.
- The extreme point is drawn on the price chart as a stop level and a "Stop" mark shows when price takes it out. After a stop there is no level until the next qualifying cross. Turn on Reverse at extreme point to start the opposite level at the stop bar, as in Wilder's always-in system.
- The trend filter is ADXR at 25 by default; ADX or Off are available. A cross that fails the filter draws nothing and leaves any level already in force unchanged.
- ADXR averages today's ADX with the ADX from ADX smoothing - 1 bars earlier (TA-Lib placement); Wilder's text uses 14 days earlier.
- Charts saved before this rule keep the ADX filter at 20.
- DI values use Wilder smoothing seeded with an average, which gives the same DI ratios as Wilder's sum seed.

## Open questions
Wilder's wording above is paraphrased and agrees with ChartSchool's account.
