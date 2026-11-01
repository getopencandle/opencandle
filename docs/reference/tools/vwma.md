---
id: vwma
name: Volume weighted moving average
kind: indicator
family: moving average
sources:
  - title: Investing with Volume Analysis
    author: Buff Dormeier
    year: 2011
    url: book
    type: primary
confidence: low
---

## Purpose
A moving average of price in which each bar is weighted by its volume, so high-volume bars pull the line more than quiet ones.

## How the author meant it to be used
Buff Dormeier presents volume-weighted moving averages in Investing with Volume Analysis (2011). The idea in general: an average that leans toward prices where more trading took place is a better estimate of the prevailing consensus price than an equal-weight average. Common use is as a dynamic support or resistance line and for crossovers against a simple average of the same length; a gap between VWMA and SMA hints at volume leading price: VWMA above SMA means higher prices traded on more volume. These usage points are general practice.

## How you interact with it
Automatic. Inputs: Length and Source. Needs volume. No placement. The value at a bar uses that bar and the previous n - 1, so it is known at the bar's close and shifts on the live bar as price and volume change.

## Calculation
Sum(source x volume) over n bars divided by sum(volume) over the same n bars. A window with zero total volume, or any missing price or volume, is unavailable. Unlike an EMA there is no seed or decay: it is a rolling window, so the line jumps when a heavy bar leaves the window.

## Standard defaults
Length 20 in OpenCandle. Source close by default.

## Reading it
Compare with an SMA of the same length. When volume is flat they coincide. Price above a rising VWMA is a bullish stance.

## Common mistakes and edge cases
- Treating it as an exponential average; it is a window.
- Instruments with no volume give nothing.
- A single volume spike dominates the window and then drops out.
- The VWAP in OpenCandle is a different tool: VWAP is cumulative from a period start, VWMA is a rolling window.

## How OpenCandle does it
- A rolling window of Length bars (default 20) on the close, with no seed or decay.
- Any missing price or volume, or zero total volume, makes the value unavailable.

## Open questions
No primary text was read; Dormeier's own parameters and any variants (for example volume-weighted EMA) are unverified.
