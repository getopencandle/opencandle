---
id: eom
name: Ease of movement
kind: indicator
family: volume
sources:
  - title: Ease of Movement, from Arms' EquiVolume work
    author: Richard W. Arms Jr.
    year: n/a
    url: book
    type: primary
  - title: ChartSchool, Ease of Movement (EMV)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/ease-of-movement-emv
    type: secondary
confidence: medium
---

## Purpose
Shows how easily price moves per unit of volume. Positive means prices rise with relative ease; negative means they fall with relative ease.

## How the author meant it to be used
ChartSchool: Richard Arms developed it from his EquiVolume charts, where each bar's width reflects volume and height reflects range. Above zero prices are advancing with ease; below zero, declining with ease. The farther from zero, the easier the move; near zero prices are likely range-bound. A wide range on low volume means it took little volume to move price.

## How you interact with it
Automatic. Inputs: length and a volume divisor. Value known at bar close. A first bar has no prior midpoint.

## Calculation
Distance moved = (high + low)/2 - (prior high + prior low)/2. Box ratio = (volume / divisor) / (high - low). 1-period EMV = distance / box ratio. EMV(N) = simple moving average of the 1-period EMV over N. ChartSchool's divisor is 100,000,000. OpenCandle: a zero-volume bar is unavailable; a bar with high equal to low has EMV 0.

## Standard defaults
Length 14 (ChartSchool). Divisor: ChartSchool uses 100,000,000; OpenCandle defaults to 10,000. The divisor only rescales the scale of the line (all values scale together), so the shape and zero crossings are unchanged.

## Reading it
Zero-line crosses indicate the ease direction; extremes indicate unusually easy movement. The scale is volume-unit and divisor dependent, so levels cannot be compared across symbols.

## Common mistakes and edge cases
- Dividing by volume in the wrong direction (box ratio is volume over range).
- Omitting the smoothing (the unsmoothed series is very jagged).
- Zero-range or zero-volume bars.
- Comparing absolute values across divisors.

## How OpenCandle does it
- Default divisor is 10,000 rather than ChartSchool's 100,000,000; this only rescales the line.
- A zero-volume bar has no value, which also blanks the 14-bar average that includes it. A bar with high equal to low gives zero.

## Open questions
Sources and OpenCandle differ on the default divisor, which only rescales the line. Which smoothing Arms used is not stated here.
