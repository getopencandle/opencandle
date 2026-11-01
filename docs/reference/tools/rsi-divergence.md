---
id: rsi-divergence
name: RSI divergence (regular, hidden, forming)
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
  - title: Technical Analysis for the Trading Professional
    author: Constance Brown
    year: 1999
    url: book
    type: secondary
confidence: medium
---

## Purpose
Finds places where price swings and RSI swings disagree: regular divergence (possible reversal), hidden divergence (possible continuation), and a provisional "forming" divergence not yet confirmed.

## How the author meant it to be used
Wilder lists divergence as the fifth of his RSI interpretations and calls it a very strong indicator of a market turning point. His definition is loose: divergence occurs when RSI is increasing while price is flat or decreasing, and the reverse when RSI is decreasing while price is flat or rising. He adds that it does not occur at every turning point but does at most significant ones; his silver example shows divergence at each major turn. ChartSchool restates this in peak form: bullish divergence is a lower low in price with a higher low in RSI; bearish is a higher high in price with a lower high in RSI. ChartSchool also says divergences are misleading in a strong trend (a strong uptrend can show many bearish divergences) and tend to be more robust after an overbought or oversold reading.

Hidden divergence is not in Wilder's text. ChartSchool does not use the term; it describes Andrew Cardwell's "positive and negative reversals" (RSI lower low with price higher low, usually with RSI between 30 and 50; RSI higher high with price lower high, usually in the 50 to 70 area) and Constance Brown's bull and bear market RSI ranges (roughly 40 to 90 and 10 to 60). Positive/negative reversals match what many call hidden divergence, but sources differ on the exact "hidden divergence" naming and attribution.

## How you interact with it
Automatic. You set RSI length and swing sensitivity. Nothing is placed. Confirmed divergences should stay put; forming ones are expected to change or vanish.

## Calculation
RSI per Wilder (Wilder smoothing of average gain and loss, first average a simple mean over N; his example multiplies the prior average by 13 and divides by 14). Pivots in price and in RSI are detected with the same rule (N bars each side), so a pivot is known N bars late. Regular bearish: price pivot high higher than the prior pivot high and RSI at that pivot lower than at the prior one; mirrored for bullish. ChartSchool says to use closing prices, since RSI is built from closes. Hidden bullish (practitioner definition): price higher low, RSI lower low; hidden bearish: price lower high, RSI higher high. Confirmed when the second pivot is confirmed. Forming means the latest unconfirmed extreme already disagrees with the last pivot; it can disappear when the bar moves on.

## Standard defaults
RSI 14 (Wilder). Pivot strength is a tool choice, commonly 3 to 5 bars each side. A look-back window for the earlier pivot is a tool choice with no source.

## Reading it
Regular divergence is a loss-of-momentum warning, not a timing signal; ChartSchool's examples wait for a breakdown or breakout to confirm. RSI behaves differently in trends (Brown's range shifts), so fixed 70/30 reasoning can mislead.

## Common mistakes and edge cases
- Marking divergence from an unconfirmed pivot (repainting).
- Comparing RSI at different bars from the price pivots.
- Treating hidden divergence as a Wilder concept.
- Divergence can persist through a whole trend.
- Gaps and low liquidity bars distort RSI.

## How OpenCandle does it
- Pivots are found on the RSI (default 5 bars each side), with the two pivots 5 to 60 bars apart.
- Price is compared at the RSI pivot bars using wick highs and lows (or bodies, with the Candle body only option), not closes as ChartSchool suggests.
- A divergence is confirmed on the pivot bar plus the right-hand bars, never earlier. Equality does not count.
- Hidden divergence is OpenCandle's own definition. The forming state is display only and cannot be used in alerts.

## Open questions
The origin and naming of "hidden divergence" differ between sources. The forming state is not exposed to alerts.
