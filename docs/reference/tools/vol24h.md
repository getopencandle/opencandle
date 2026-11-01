---
id: vol24h
name: 24-hour volume
kind: indicator
family: volume
sources:
  - title: Common charting convention (rolling trailing-day volume)
    author: no single author
    year: n/a
    url: n/a
    type: secondary
confidence: low
---

## Purpose
Shows how much volume traded in the trailing 24 hours, so intraday and 24-hour markets (crypto, futures, forex) can be compared on a steady footing rather than per bar.

## How the author meant it to be used
No single author or original publication. It is a plain rolling sum used for 24-hour markets, where "daily volume" has no session boundary.

## How you interact with it
Automatic. No inputs, no placement. The value on each bar is known at that bar's close (the current bar is part of its own window) and never changes after the bar closes, because only current and earlier bars are read.

## Calculation
For bar t: the sum of volume of all bars whose open time lies within the 24 hours up to and including bar t. On daily and longer bars this equals the bar's own volume. OpenCandle marks the value unavailable if any bar in the window has missing volume, and it keeps gaps in the volume data instead of filling them.

## Standard defaults
A 24-hour window; no parameters.

## Reading it
Rising values mean more activity over the last day. Compare against the series' own history, not an absolute level. Spikes show news or session-open activity.

## Common mistakes and edge cases
- Using a bar-count window instead of a time window (wrong when bars are missing or the interval is irregular).
- Window boundary: a bar exactly 24 hours earlier should drop out, the current bar should be in.
- Treating a missing-volume bar as zero; it should make the value unavailable.
- Daily and longer intervals should return plain volume.
- The first 24 hours of data form a partial window.

## How OpenCandle does it
- The window is the 24 hours up to and including the bar, judged by bar open time. A bar exactly 24 hours earlier drops out.
- Missing or negative volume anywhere in the window makes the value unavailable.
- On daily and longer charts the value is the bar's own volume.
- The first 24 hours of loaded data show a growing partial sum, which can look like a ramp at the left edge.

## Open questions
Whether other tools use open-time or close-time for the window is unverified; OpenCandle's choice is its own definition.
