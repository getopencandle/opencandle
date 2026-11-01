---
id: tradingsessions
name: Trading sessions
kind: indicator
family: session
sources:
  - title: Common charting convention for market-session shading
    author: common charting convention
    year: n/a
    url: n/a
    type: secondary
confidence: medium
---

## Purpose
Highlights configurable intraday windows (for example Tokyo, London, New York) on the chart, with each session's range, open and close guides and average close.

## How the author meant it to be used
No single author. Traders use session windows to see when liquidity and volatility concentrate and how price behaves in each global session (range, direction, overlap).

## How you interact with it
Automatic, chart-only visual study. You enable up to several windows and sets each window's name, start time, end time, time zone and colour, plus toggles for session names, open and close guides, range in ticks and average close. Nothing is clicked on the chart. Configure times before enabling a window. Geometry describes sessions that have been observed, so the live session grows as bars arrive and its numbers are not final until the end. Alerts cannot capture it.

## Calculation
A bar belongs to a window if its time in the window's zone falls between start (inclusive) and end (exclusive); equal start and end mean a full local day. Windows that cross midnight wrap. Each included bar contributes its whole open, high, low and close; a bar that opens before the window starts is not included. Per session: box from the lowest low to the highest high, open and close guides, range in ticks, and the average close, which uses only the observed prefix. Defaults start with Tokyo, London and New York cash sessions in their own exchange zones.

## Standard defaults
Tokyo, London and New York cash sessions enabled (OpenCandle choice; the reference clock times are not fixed by any standard).

## Reading it
Compare ranges and closes across sessions; session overlaps often have higher activity.

## Common mistakes and edge cases
- Daylight saving shifts: sessions defined in local zones move relative to UTC.
- Chart intervals longer than the window cannot represent it.
- Sessions that span midnight.
- A bar is counted whole if it opens inside the window; a bar that opens before the start is excluded even if most of it falls inside.
- Missing data inside a session should not be filled in.

## How OpenCandle does it
- A bar belongs to a session by its open time: start included, end excluded.
- A window that crosses midnight belongs to the day it opened. Equal start and end times mean a full day.
- A bar that opens before the start is left out entirely, even if most of it falls inside the window.
- A bar with invalid data makes that session unavailable from then on.
- The average close uses only the bars observed so far in the session.
- Tokyo, London and New York are on by default, each in its own exchange time zone.

## Open questions
Exact clock times for each global session are conventions; OpenCandle's defaults are its own.
