---
id: dpo
name: Detrended price oscillator
kind: indicator
family: cycle
sources:
  - title: ChartSchool, Detrended Price Oscillator
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/detrended-price-oscillator-dpo
    type: secondary
  - title: No single original author located; classic cycle-analysis tool
    author: unknown
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
Removes the trend from price so cycle highs and lows, and the length of cycles, are easier to see. It is not a momentum oscillator.

## How the author meant it to be used
No original author was identified. ChartSchool: DPO compares price with a simple moving average that is displaced so it sits in the middle of its own look-back. It is used to identify cycle peaks and troughs and to estimate cycle length, not for timely trade signals. Because it relies on a displaced average it does not extend to the latest bar; this is by design, since alignment with the last date is not the point.

## How you interact with it
Automatic. Inputs: period, source, and a "centered" option. Centered (the ChartSchool form): the value on bar t is price(t) minus SMA(t + k), so the latest k bars have no value and fill in as bars close. Not centered: the value on bar t is price(t - k) minus the current SMA(t), so it reaches the last bar but the price part is old. Both give the same numbers shifted by k bars. This means a centered value for a given bar is not final until k later bars exist.

## Calculation
k = floor(N / 2) + 1. SMA = simple moving average of N bars. Centered: DPO(t) = price(t) - SMA(t + k). ChartSchool's example for a 20-day DPO uses a displacement of 11 (20/2 + 1).

## Standard defaults
ChartSchool illustrates period 20 (displacement 11). OpenCandle's default is 21, Centered off; these are OpenCandle-defined.

## Reading it
Above zero means price above the centred average; the turning points mark cycle peaks and troughs. Distance between successive peaks estimates cycle length.

## Common mistakes and edge cases
- Using the current price minus the current SMA, which is just a distance from an average and not detrended.
- Using displacement N/2 without the +1, or ignoring integer division for odd periods.
- Expecting centered values on the right edge.
- Reading it for momentum signals.

## How OpenCandle does it
- Displacement is half the length rounded down, plus one. Default length is 21, Centered off.
- Not centered follows ChartSchool: price k bars back minus the current average. Some platforms use today's close minus the average k bars back, which is a different series.
- Centered leaves the latest k bars blank; they fill in as bars close and a shown value never changes.

## Open questions
For odd periods the displacement rounding (floor then +1) matches OpenCandle; ChartSchool only shows the even case.
