---
id: rsifs
name: RSI failure swings
kind: indicator
family: signals
sources:
  - title: New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: primary
  - title: ChartSchool, Relative Strength Index
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-strength-index-rsi
    type: secondary
  - title: TA-Lib RSI source, ta_RSI.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_RSI.c
    type: secondary
confidence: high
---

## Purpose
Marks Wilder's "failure swing" pattern in RSI, which he listed among the strongest RSI signals.

## How the author meant it to be used
Wilder lists failure swings as the third of five RSI interpretations (after tops and bottoms, and chart formations) and says failure swings above 70 or below 30 are very strong indications of a market reversal. His figures show the top case: RSI reaches the upper zone, falls back (this valley is the "failure swing point"), rallies again without exceeding the earlier high, and then falls through the valley. The sell point is the penetration of the failure swing point, not the second peak. His worked example: RSI reached 70, the down swing carried to 58, the next up swing was made of small swings that did not break the high, and he writes that when the low point of 58 was penetrated the failure swing was completed. The bottom case mirrors it: after an RSI low near 30, the bounce carried to 41, and the failure swing completed when that 41 point was penetrated on the up side. He says failure swings are most significant after an RSI high near 70 or low near 30.

Exact trigger: top failure swing = RSI makes a peak at or above the overbought zone, pulls back to a valley, makes a lower peak (does not exceed the first peak), then falls below the valley value. Bottom = mirror.

ChartSchool states it slightly differently: a bearish failure swing is RSI above 70, a pullback, a bounce that fails to exceed 70, then a break of the prior low. That variant requires the second peak to stay below the 70 level; Wilder's text requires it to stay below the first peak. The pattern is read on the RSI line itself, independent of price.

## How you interact with it
Automatic. You set RSI length, the overbought/oversold levels, the Minimum swing (RSI points, default 3) and, optionally, whether the second peak must stay inside 70/30. No placement.

## Calculation
RSI: gain and loss series from close changes; first average gain/loss is the simple mean over N; then Wilder smoothing avg = (prev * (N - 1) + current) / N (Wilder's worked example multiplies the prior average by 13, adds the new value and divides by 14). RSI = 100 - 100 / (1 + avgGain/avgLoss). TA-Lib follows the same method. A failure swing needs the sequence above. The signal is known on the bar whose RSI breaks the valley, at that bar's close and not before. Peaks and valleys need a minimum swing size, so one-bar wiggles do not count, and the pattern cannot be labelled at its first peak.

## Standard defaults
RSI 14, levels 70 and 30 (Wilder; ChartSchool confirms). Other levels or lengths are practitioner choices.

## Reading it
A bullish failure swing below 30 is a buy alert; a bearish one above 70 is a sell alert. ChartSchool cautions that overbought readings can persist in strong trends, so a bearish failure swing may only mark a pause.

## Common mistakes and edge cases
- Signalling on the second peak instead of the break of the valley.
- Not requiring the second peak to stay below the first.
- Counting one-bar RSI wiggles as swings; the minimum swing size filters these.
- Using simple-average RSI instead of Wilder smoothing gives different values.
- Early bars are unreliable because of the smoothing start-up.

## How OpenCandle does it
- The first peak must be strictly beyond 70 (or 30). The signal fires on the first close that breaks the failure point, never earlier, so a drawn mark never changes.
- Minimum swing (RSI points) is 3 by default. Both the pullback from the first peak and the rally after it must reach that size, otherwise a lower RSI just lowers the failure point. This is OpenCandle's addition to filter one-bar wiggles.
- The failure point of a top must stay above the oversold level (a bottom's below overbought); otherwise the pattern is dropped. A rally that exceeds the first peak restarts the swing.
- Optional: Second peak must stay inside 70/30 (the ChartSchool reading, off by default). Wilder requires only that the second peak does not exceed the first.

## Open questions
OpenCandle requires the first peak to go beyond 70/30. The ChartSchool variant, where the second peak must also stay inside the zone, is an option and is off by default.
