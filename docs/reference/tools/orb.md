---
id: orb
name: Opening range breakout
kind: indicator
family: structure
sources:
  - title: Playing the opening range breakout, Part 1 (article abstract), Technical Analysis of Stocks & Commodities, September 1988
    author: Toby Crabel
    year: 1988
    url: https://store.traders.com/-v06-c09-playing-pdf.html
    type: primary
  - title: Opening Range Breakout, Part 4, Stocks & Commodities, 1989
    author: Toby Crabel
    year: 1989
    url: https://store.traders.com/-v07-c02-orb-pdf.html
    type: primary
  - title: Opening Range Breakout, Part 7, Stocks & Commodities, 1989
    author: Toby Crabel
    year: 1989
    url: https://store.traders.com/-v07-c06-orb-pdf.html
    type: primary
  - title: Day Trading with Short Term Price Patterns and Opening Range Breakout
    author: Toby Crabel
    year: 1990
    url: book
    type: primary
confidence: medium
---

## Purpose
Draws the high and low of the first part of the trading session (the opening range) and flags breaks above or below it.

## How the author meant it to be used
Crabel's own magazine abstracts define the method. An opening range breakout is a trade taken at a predetermined amount above or below the opening range. That amount is the "stretch". A buy stop is placed one stretch above the high of the opening range and a sell stop one stretch below its low; the first stop that trades is the position, and the other stop becomes the protective stop. He describes the opening range as the range of prices in the first 30 seconds to 5 minutes of trading (Part 7), so his range is very short and his work is on futures. The stretch is the average, over the previous 10 days, of the difference between each day's open and the extreme closest to the open (September 1988 abstract and Part 7). In Part 4 he says he set the stretch through observation.

He also describes an "Opening Range Breakout Preference": in a market with a strong directional bias, only the stop in that direction is placed, and if the market trades one stretch the other way first, the preference is cancelled. Part 4 tests the hypothesis that inside days (high below the prior high and low above the prior low) precede trend days and successful breakouts; Part 7 studies the bear hook pattern with ORB trades. NR4 and NR7 (narrowest range of 4 or 7 days) are commonly tied to Crabel, though the sources used here do not confirm it.

The 15 and 30 minute windows used by many traders are later practitioner conventions, not Crabel's.

## How you interact with it
Automatic once the window length and session start are set. Nothing is placed. The range lines should freeze at the end of the opening window and extend to the end of the session; they must not change afterward.

## Calculation
Crabel's form: entry levels = opening range high plus stretch and opening range low minus stretch, with stretch = 10-day average of |open - closest of high or low|, entered intrabar by stop order. Charting convention (not Crabel's): opening range = highest high and lowest low from the session open until the window ends; a breakout is a close above the range high after the window has finished (a wick touch is a weaker variant), the mirror for a breakdown. Bars inside the window cannot signal, because the range is not final until the window closes. Session open is defined by the exchange calendar and its time zone. A close-based signal is known at the bar close; Crabel's stop-based entries are not close-based.

## Standard defaults
Crabel: 10-day stretch; opening range of roughly 30 seconds to 5 minutes. Common charting windows are 5, 15 or 30 minutes (secondary).

## Reading it
Crabel treats a break of the opening range by the stretch as evidence of the day's direction, and ties it to prior-day patterns such as inside days. Many traders require a retest or volume confirmation (common practitioner practice).

## Common mistakes and edge cases
- Letting the range keep updating after the window ends.
- Signalling inside the window.
- Wrong session start (time zone, daylight saving, half days).
- Gaps: the open may sit outside yesterday's range, changing meaning.
- Daily or higher timeframes have no intraday opening range.
- Extended-hours data included in the range by accident.
- Calling a plain range-high close break "Crabel's ORB" when his method adds the stretch.

## How OpenCandle does it
- Marks the common charting version, not Crabel's stop-order entries: the opening range is the high and low of the first 5 minutes (15, 30 or 60 are available), and a breakout is the first close beyond that range, once per side per session. There is no stretch.
- The lines appear only after the range is complete and stop at the session end. A bar that opens inside the window but ends after it extends the range.
- Session is the exchange session (09:30 to 16:00 New York for US stocks, 00:00 UTC otherwise) or a custom one. Optional targets sit at 1x and 2x the range.
- Intraday charts only: daily and longer charts show a notice and no values.

## Open questions
The book's own entry rules beyond the articles are not covered here. OpenCandle requires a close and does not offer a stretch.
