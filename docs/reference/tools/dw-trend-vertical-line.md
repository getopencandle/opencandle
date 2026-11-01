---
id: dw-trend-vertical-line
name: Vertical line
kind: drawing
family: trend lines
sources:
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: high
---

## Purpose
A vertical line at one bar or time spanning the full pane height. It marks an event, session start, earnings date or cycle point.

## How the author meant it to be used
A plain annotation positioned in time, not price. Analysts use it for event dates and as the repeating lines of cycle tools. No single author.

## How you draw it
One click at the desired bar. Dragging moves it left or right only. A time label sits on the time axis. Hotkey in OpenCandle: Alt + V, at the cursor. The anchor is a time, so on interval change the line sits at the same moment.

## Geometry and levels
x = t1 at all prices, unaffected by price scale or log mode. It spans above and below the visible price range, so it survives price pans.

## Standard defaults
Single line with a time-axis label (date, plus time on intraday charts).

## Reading it
Marks when something happened so you can see what price did before and after. No signal of its own.

## Common mistakes and edge cases
- A time in a non-trading gap must snap to a sensible bar.
- On interval change a line on a daily bar becomes a mid-bar position on an hourly chart.
- The label time zone should match the axis.
- A future-dated line must remain valid as bars arrive.

## How OpenCandle does it
- A time inside a bar's period snaps to that bar, including the newest bar.
- A time in a session gap (for example a midnight time on intraday stock data) sits between the last bar before the gap and the first bar after it.

## Open questions
- Whether OpenCandle snaps to bar centre or keeps the exact time.
- No external source describes behaviour.
