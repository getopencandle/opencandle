---
id: smiergodicosc
name: SMI ergodic oscillator
kind: indicator
family: oscillator
sources:
  - title: Momentum, Direction, and Divergence
    author: William Blau
    year: 1995
    url: book
    type: primary
  - title: ChartSchool, True Strength Index (same construction)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/true-strength-index
    type: secondary
confidence: low
---

## Purpose
The histogram part of Blau's SMI ergodic indicator: the SMI minus its signal line, shown on its own.

## How the author meant it to be used
Blau's ergodic oscillator shows the gap between the SMI and its signal EMA, like a MACD histogram. Positive means the SMI is above its signal (momentum improving), negative below. Zero-line crossings of the histogram are the same events as signal-line crosses of the SMI. Divergence against price is read on the histogram's peaks. 

## How you interact with it
Automatic histogram in its own pane. Set long, short and signal lengths and source. Nothing placed; no repainting of closed bars; the live bar updates until close.

## Calculation
See SMI ergodic indicator/oscillator. Oscillator = SMI - EMA(SMI, signal length), where SMI = 100 x EMA(EMA(m, long), short) / EMA(EMA(|m|, long), short) and m is the one-bar change. The long EMA is first; EMAs are SMA-seeded.

## Standard defaults
20, 5, 5, source close.

## Reading it
Histogram bars growing away from zero mean strengthening momentum in that direction; shrinking bars warn of a coming signal cross. It needs long + short + signal - 1 bars before the first value.

## Common mistakes and edge cases
- Treating it as a bounded oscillator; it is a difference and is small near zero.
- Wrong sign order (signal minus SMI).
- Zero denominator should be unavailable.

## How OpenCandle does it
- Same calculation as SMI ergodic, showing only the oscillator (SMI minus signal). The SMI is scaled to 100, as Blau's TSI is.
- The long EMA is applied first, then the short one, and all EMAs are seeded with a simple average.
- Defaults are 20, 5 and 5 on the close.

## Open questions
Same open items as smiergodic (scaling and defaults unverified against Blau's text).
