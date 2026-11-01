---
id: rbreversal
name: Rob Booker - Reversal
kind: indicator
family: signals
sources:
  - title: Rob Booker's reversal setup (MACD plus slow stochastic), own materials not located
    author: Rob Booker
    year: n/a
    url: book
    type: primary
  - title: ChartSchool, Stochastic Oscillator (for the stochastic building block)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/stochastic-oscillator-fast-slow-and-full
    type: secondary
confidence: low
---

## Purpose
Marks reversal candidates when a MACD cross happens while a slow stochastic sits in an extreme zone.

## How the author meant it to be used
OpenCandle uses this setup: MACD (12, 26, 9) combined with a slow stochastic (70, 10) at overbought (80) or oversold (20). Intent: an extreme stochastic says price is stretched; a MACD signal-line cross says momentum has turned; together they flag a reversal. The specific trigger below is OpenCandle's own interpretation.

## How you interact with it
Automatic overlay. Set the MACD lengths, the stochastic length and smoothing, and the upper and lower bands. Nothing is placed. Signals appear on the bar of the cross and use only bars up to it, so they do not repaint once the bar closes.

## Calculation
MACD line = EMA(fast) - EMA(slow); signal = EMA(MACD, signal length); EMAs use an SMA seed. Stochastic: raw %K over 70 bars, smoothed with 10 (slow %K). Bullish reversal = MACD crosses above its signal while smoothed %K is at or below the lower band (20); bearish = MACD crosses below its signal while %K is at or above the upper band (80). A flat stochastic window is unavailable.

## Standard defaults
MACD 12/26/9, stochastic 70 with smoothing 10, bands 80 and 20.

## Reading it
A signal marks possible exhaustion; confirm with price structure. In strong trends the stochastic can stay extreme and the signals keep failing.

## Common mistakes and edge cases
- Requiring the cross and the zone to hold on the same bar versus within a window.
- Using EMA seeding differently from the MACD convention.
- Treating the signals as entries without confirmation.

## How OpenCandle does it
- The MACD cross and the stochastic zone must both hold on the same bar.
- The slow stochastic uses a 70-bar %K smoothed with a 10-bar SMA; MACD EMAs start from a simple average. A flat stochastic window gives no value.
- This trigger is OpenCandle's own interpretation.

## Open questions
Booker's actual trigger (cross on the same bar, or within a few bars) is not documented; OpenCandle requires the same bar.
