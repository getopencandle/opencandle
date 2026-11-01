---
id: vo
name: Volume oscillator
kind: indicator
family: volume
sources:
  - title: ChartSchool, Percentage Volume Oscillator (PVO)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/percentage-volume-oscillator-pvo
    type: secondary
confidence: medium
---

## Purpose
Shows whether recent volume is running above or below its longer-term level, as a percent difference between a short and a long moving average of volume.

## How the author meant it to be used
There is no single author; the idea of an oscillator on volume moving averages is a common variant of the price oscillator. The nearest published reference is ChartSchool's Percentage Volume Oscillator (PVO), which uses the same construction with EMAs of 12 and 26 and adds a 9-period signal line and histogram. It says volume is above average when the oscillator is positive and below average when negative, a negative and rising value means volume is increasing, and a positive and falling value means it is decreasing. It warns that moving averages lag, so the oscillator can be out of step with price. OpenCandle's version has no signal line or histogram and uses shorter lengths.

## How you interact with it
Automatic. Inputs: short length and long length. No placement. Known at the bar's close (the live bar's volume is partial, so its value is provisional until close). Needs volume data; instruments without volume show nothing.

## Calculation
(EMA(volume, short) - EMA(volume, long)) / EMA(volume, long) x 100. OpenCandle seeds the EMAs with a simple average as ChartSchool and TA-Lib do. A zero long EMA is unavailable. Some tools use simple averages instead of EMAs, or plot the raw difference rather than the percent; those variants give different numbers.

## Standard defaults
OpenCandle: 5 and 10 (OpenCandle's own choice). ChartSchool's PVO: 12 and 26 with a 9-period signal.

## Reading it
Above zero: short-term volume above the long-term average (expanding). Below: contracting. Volume that expands with the trend is the classic confirmation; expansion against a move is a warning.

## Common mistakes and edge cases
- Confusing it with the PVO that includes a signal line and histogram.
- Using EMA vs SMA without noticing.
- Reading the level as absolute volume; it is a ratio in percent.
- Live-bar volume is incomplete, so the latest value is unreliable.

## How OpenCandle does it
- Uses the percent form with EMAs of volume at 5 and 10, seeded with a simple average.
- There is no signal line or histogram (ChartSchool's Percentage Volume Oscillator uses 12 / 26 / 9).

## Open questions
Which averaging type the original reference list uses is unknown; OpenCandle uses EMA. There is no primary author.
