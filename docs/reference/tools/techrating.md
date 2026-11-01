---
id: techrating
name: Technical ratings
kind: indicator
family: composite
sources:
  - title: Technical ratings voting method (no single author; OpenCandle records a public method)
    author: common practice
    year: n/a
    url: n/a
    type: secondary
confidence: low
---

## Purpose
Summarises many moving averages and oscillators into one number from -1 (strong sell) to +1 (strong buy) per bar.

## How the author meant it to be used
No single author; it is a consensus-voting idea. Each component indicator votes buy (+1), neutral (0) or sell (-1); each group rating is the mean of its votes; the summary is the mean of the two groups. Bands: strong buy from 0.5, buy from 0.1, neutral between, sell from -0.1, strong sell from -0.5. It is a descriptive summary of current indicator states, not a forecast.

## How you interact with it
Automatic, in its own pane. The only setting is which group to use: all, moving averages only, or oscillators only; the two group ratings can be shown as extra lines. Nothing is placed. Each bar uses current and earlier bars, so closed bars do not repaint, but the live bar's rating changes as price moves. The moving-average rating needs 200 bars; the oscillator rating needs about 50.

## Calculation
Moving averages (15 votes): SMA and EMA at 10, 20, 30, 50, 100 and 200; VWMA 20; Hull MA 9; Ichimoku base line. Oscillators (11): RSI 14, Stochastic 14 3 3, CCI 20, ADX 14, Awesome oscillator, Momentum 10, MACD 12 26 9, Stochastic RSI, Williams %R 14, Bull bear power, Ultimate oscillator 7 14 28. The per-indicator vote rules are OpenCandle's own readings of the public method (for example ADX votes on the DI order while ADX is above 20 and rising; Ichimoku votes close versus base line). A vote an indicator cannot give counts as neutral after warm-up.

## Standard defaults
Rating based on All.

## Reading it
Values past +0.5 or -0.5 mean broad agreement. Agreement of lagging indicators describes the move already made.

## Common mistakes and edge cases
- Treating the rating as predictive.
- Mixed warm-up lengths: early bars have only one group.
- Exact vote rules vary between tools, so values differ across platforms.
- Using intraday data with 200-bar averages gives a short history.

## How OpenCandle does it
- The vote rules are OpenCandle's own readings of the public method.
- The Stochastic and Stochastic RSI votes need both %K and %D past the level; the public method uses only the main line.
- The oscillator group is ready after about 50 bars and the moving-average group after 200.

## Open questions
The vote rules are unverified against any original; many choices are labelled OpenCandle-defined.
