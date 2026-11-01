---
id: adr
name: Average daily range
kind: indicator
family: volatility
sources:
  - title: Common charting convention (simple average of high minus low)
    author: no single author
    year: n/a
    url: n/a
    type: secondary
confidence: low
---

## Purpose
Shows the typical size of a bar's high-to-low range, in price units, as a volatility gauge for sizing stops and targets.

## How the author meant it to be used
No single author. It is a simple average of daily ranges used by day traders to judge how far an instrument usually travels in a day and so how much of that range has already been used. It differs from Wilder's Average True Range, which includes gaps from the previous close; ADR ignores gaps.

## How you interact with it
Automatic. One input, length (default 14). The value is known at the bar's close. On intraday charts OpenCandle uses the ranges of the last N completed trading days (not the intraday bars), so the value is flat through each day and the developing day never counts. If the loaded history starts part-way through a day, that partial first day is left out.

## Calculation
ADR = simple moving average over N days of (High - Low). Some tools report it as a percentage of price, or average the daily high-to-low percentage; OpenCandle uses price units.

## Standard defaults
14 days is common; 5, 10 and 20 are also used.

## Reading it
Rising ADR: expanding daily movement; falling: contraction. Compare today's range with the ADR to see how stretched the day is.

## Common mistakes and edge cases
- Using the bar range on intraday bars instead of daily ranges.
- Including the developing day, which makes the value change during the day.
- Confusing it with ATR (includes gaps) or with ADX.
- Day boundaries: which time zone and session defines "the day".

## How OpenCandle does it
- Values are in price units; the default length is 14.
- On daily charts it is the simple average of the bar range and includes the current bar. On weekly and monthly charts it is an average weekly or monthly range, despite the name.
- On intraday charts it averages the high-to-low range of the last completed days, built from your loaded bars including extended hours. Days follow New York dates on US stock charts and UTC dates elsewhere.
- The first day of the loaded history is ignored because it usually starts part-way through the day and would understate the range.

## Open questions
Whether OpenCandle uses New York or exchange dates and whether holidays and half days are skipped is its own policy; no external source defines it.
