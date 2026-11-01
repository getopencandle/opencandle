---
id: woodiescci
name: Woodies CCI
kind: indicator
family: momentum
sources:
  - title: Woodies CCI Club methodology
    author: Ken Wood ("Woodie")
    year: n/a
    url: book
    type: primary
  - title: ChartSchool, Commodity Channel Index
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/commodity-channel-index-cci
    type: secondary
confidence: low
---

## Purpose
A CCI-based oscillator from the Woodies CCI Club approach: a 14-period CCI plus a faster 6-period "turbo" CCI, with the histogram coloured by trend, used for day-trading entries on pullbacks.

## How the author meant it to be used
Ken Wood ("Woodie") built a day-trading system around the CCI with a set of named patterns. The main CCI is 14-period; the turbo CCI is 6-period and reacts faster. The histogram is coloured to show trend: after the CCI has stayed on one side of zero for a run of bars (six in OpenCandle) the trend is declared up or down; the early bars of the run stay neutral. Named patterns include the zero-line reject, the trend-line break, the hook from extremes and the "famir" (false breakout counter-trend) setups; none of these are in OpenCandle. The base CCI is from Donald Lambert (Commodities magazine, 1980): ChartSchool gives CCI = (typical price - SMA of typical price) / (0.015 x mean deviation), with the constant chosen so that about 70 to 80 percent of values fall between -100 and +100.

## How you interact with it
Automatic. Inputs: CCI length (14) and turbo length (6). No placement. Values are known at the close; the histogram colour switches only when the run count reaches six, so a trend label appears after the sixth bar of a run and can change on the live bar while the CCI crosses zero.

## Calculation
Typical price = (high + low + close) / 3. CCI = (TP - SMA(TP, n)) / (0.015 x mean absolute deviation of TP from that SMA over n). Turbo CCI uses n = 6. The histogram plots the 14-period CCI; its colour is green after at least six consecutive positive CCI bars, red after at least six consecutive negative, otherwise neutral. A CCI of exactly zero resets the count. Mean deviation of zero gives no value. Colours are OpenCandle's.

## Standard defaults
CCI 14, turbo 6, guide lines at +100, 0 and -100 (OpenCandle's choice, close to the Woodie setup as usually described).

## Reading it
Above zero for six or more bars: uptrend; below: downtrend. Turbo CCI crossing zero is the faster timing line. Beyond +100 or -100 is the extreme zone in standard CCI terms.

## Common mistakes and edge cases
- Using 20 as in generic CCI instead of 14.
- Counting bars from a CCI of exactly zero as continuing a run.
- Treating the six-bar rule as an official constant.
- Applying it on non-trending intervals where the colour flips constantly.

## How OpenCandle does it
- The histogram colour needs a run of 6 bars on one side of zero (the current bar plus 5 earlier). A CCI of exactly zero, or a missing value, resets the run.
- Woodie's named patterns and the timing colours of the original system are not drawn.

## Open questions
The full pattern vocabulary, the exact trend-run length and the colour rule of the original system are unverified and unimplemented. Low confidence overall.
