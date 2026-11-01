---
id: visibleavg
name: Visible average price
kind: indicator
family: price
sources:
  - title: Arithmetic mean of the visible chart range (no single author)
    author: common charting convention
    year: n/a
    url: common charting convention
    type: secondary
confidence: medium
---

## Purpose
A horizontal line at the mean of the chosen price source across the bars you can currently see. It answers "what was the average price in this view".

## How the author meant it to be used
There is no author or paper. It is a viewport statistic: the plain arithmetic mean of the source over the visible bars. It is useful as a visual fair-value reference for the range you are studying, not as a trading rule.

## How you interact with it
Automatic, but it depends on the view, not on the data alone. Panning or zooming changes which bars are included and therefore the value, so the line moves as you scroll. Input: price source only. Nothing is placed or dragged. Because it uses visible bars including the newest one when visible, the value changes while the last bar forms. There is no look-ahead, but it is not stable under navigation by design. Do not use it in an alert or backtest expecting a fixed value.

## Calculation
Mean of the source (default close, or as set) for every bar whose open time lies within the visible time bounds, inclusive at both ends (OpenCandle's edge policy). The same value is drawn on each visible bar and no value on bars outside the view. Without chart bounds, all loaded bars are used. The mean uses a compensated sum, so very large values do not overflow.

## Standard defaults
Source: close. No length.

## Reading it
Price above the line is above the average of the current view; below is below. Zooming out toward the whole history makes it the long-run mean.

## Common mistakes and edge cases
- Expecting a rolling average; there is no period, the window is the screen.
- A partly visible edge bar: included only if its open time is inside the range.
- Missing source values in the visible range make the result unavailable.
- Value jumps when the interval changes, since the visible bar set changes.

## How OpenCandle does it
- A bar is included when its open time is inside the visible range, both ends included.
- With no chart range (for example in alerts) it uses every loaded bar. The value moves as you pan or zoom, so it is not suited to alerts or backtests.
- Default source is the close.

## Open questions
Whether other tools include a bar whose open is just outside the left edge but whose body is visible is unknown; OpenCandle's rule is open time inside the bounds.
