---
id: spread
name: Spread
kind: indicator
family: comparison
sources:
  - title: Common charting convention for price spreads
    author: common charting convention
    year: n/a
    url: n/a
    type: secondary
confidence: medium
---

## Purpose
Shows the difference between the chart symbol and a second symbol, bar by bar, to track relative value in pairs and calendar or inter-market trades.

## How the author meant it to be used
There is no single author. Spread charts are used to study the gap between two related instruments: a widening or narrowing spread signals relative strength or weakness, and mean reversion of the spread is the basis of pairs trading. A multiplier lets one leg be scaled (for example hedge ratios or contract sizes).

## How you interact with it
Automatic, in its own pane. You pick the second symbol, the source (close by default) and a multiplier. The second symbol's data must be loaded; bars are matched by time, and a bar missing on either side is unavailable. Values use only the current bar, so nothing repaints once the bar closes. A zero line is shown.

## Calculation
Spread(t) = Source of the chart symbol(t) - Multiplier x Close of the second symbol(t). OpenCandle defaults to second symbol SPY, multiplier 1, source close (OpenCandle choices).

## Standard defaults
Multiplier 1. The second symbol has no universal default.

## Reading it
Above zero the chart symbol is worth more than the scaled second symbol. Look at changes and extremes of the spread, not the level, unless both are in the same units.

## Common mistakes and edge cases
- Comparing symbols with different currencies or trading calendars without alignment.
- Differing session times produce missing bars.
- A ratio and a spread answer different questions; a spread depends on price level.
- Multiplier of 0 gives just the source.

## How OpenCandle does it
- Bars are matched by exact time with no filling. A bar missing on either side has no value.
- Defaults are SPY as the second symbol, multiplier 1 and the close as source.

## Open questions
How OpenCandle aligns bars when intervals or calendars differ was not examined in detail.
