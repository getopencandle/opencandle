---
id: psar
name: Parabolic SAR
kind: indicator
family: trend / stops
sources:
  - title: New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: primary
  - title: ChartSchool, Parabolic SAR
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/parabolic-sar
    type: secondary
  - title: TA-Lib SAR source, ta_SAR.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_SAR.c
    type: secondary
confidence: high
---

## Purpose
Wilder's "Parabolic Time/Price System": a trailing stop-and-reverse level that accelerates toward price as a trend ages, giving both a stop and a reversal signal.

## How the author meant it to be used
Wilder introduced it in 1978 (ChartSchool confirms book and name). SAR is plotted below price in an uptrend and above in a downtrend. When price trades through the SAR, the position stops and reverses: the trend flips, SAR jumps to the other side at the prior extreme point, and the acceleration restarts. It works best in trending markets; in ranges it whipsaws.

## How you interact with it
Automatic. You set Start (initial acceleration factor), Increment and Maximum. Nothing is placed. The SAR for the next bar is computed at the close of the current bar, so it is known one bar ahead and does not repaint once the bar closes; the reversal is recognised when a bar trades through the SAR. Early values depend on the initial direction guess, so the first few bars may flip until a real trend is found.

## Calculation
Uptrend: SAR(t) = SAR(t-1) + AF(t-1) x (EP(t-1) - SAR(t-1)); EP is the highest high of the uptrend; AF starts at 0.02 and rises by 0.02 each time EP makes a new high, capped at 0.20. SAR may never be above the lows of the prior two bars (if it is, use the lower low). Downtrend: SAR(t) = SAR(t-1) - AF(t-1) x (SAR(t-1) - EP(t-1)); EP is the lowest low; SAR may never be below the highs of the prior two bars. Reversal: if the bar's low in an uptrend (or high in a downtrend) penetrates SAR, the new SAR is the prior EP, the trend flips, AF resets to the start value, EP becomes that bar's extreme. TA-Lib initialises the direction from the first bar's minus-DM, and caps the start AF at the maximum.

## Standard defaults
Start 0.02, increment 0.02, maximum 0.20 (Wilder; ChartSchool confirms).

## Reading it
Dots flip side = reversal signal. Use the dot as a trailing stop. A lower step moves SAR farther from price (fewer reversals); a higher step or maximum makes it more sensitive and increases whipsaws (ChartSchool).

## Common mistakes and edge cases
- Letting SAR go inside the prior two bars' range (the two-bar clamp is part of the system).
- Not resetting AF on reversal.
- Raising AF every bar instead of only on new extremes.
- Gap bars that jump over the SAR: the reversal triggers on that bar.
- Initial-direction differences make early values differ between implementations.

## How OpenCandle does it
- Follows the common charting built-in order of steps. It differs from Wilder and TA-Lib in four small ways.
- The reversal test uses the stepped SAR before the two-bar clamp, so a rare reversal can occur on a bar the clamped SAR would not have reached (needs a large acceleration factor).
- Penetration must be strict: a touch does not reverse (TA-Lib reverses on a touch).
- On a reversal the new SAR is the bar's high or low if that is more extreme than the prior extreme point, which guards outside bars.
- The initial direction comes from the second close versus the first (TA-Lib uses minus-DM), so the first reversal can differ.

## Open questions
OpenCandle seeds direction by comparing the second close to the first; TA-Lib uses minus-DM, so the first reversal may differ.
