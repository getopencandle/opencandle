---
id: volindex
name: Volatility index
kind: indicator
family: volatility
sources:
  - title: The VIX Fix, Active Trader magazine, December 2007
    author: Larry Williams
    year: 2007
    url: book
    type: primary
confidence: low
---

## Purpose
A bars-only proxy for the shape of the VIX fear index. It measures how far the current low has fallen below the recent highest close, as a percent, and spikes in panic selloffs.

## How the author meant it to be used
Larry Williams introduced the "VIX Fix" to give a VIX-like reading on instruments that have no volatility index. The idea is that fear spikes coincide with sharp drops below recent highs, so the fix spikes at market lows. Used as a bottoming tool: a spike to a high reading (often compared with a band) marks capitulation and a potential low. This is not the CBOE VIX; no option data is read. Note that "Volatility Index" is also the name Wilder gave his own volatility stop-and-reverse system (see Volatility stop); this tool is the Williams measure.

## How you interact with it
Automatic. One input, Length. No placement. Known at the bar's close. It uses the current bar's low and the highest close of the last n bars including the current one. The reading on the live bar changes while the bar forms and can rise sharply intrabar.

## Calculation
Highest close over n bars = HC. Index = 100 x (HC - low) / HC. First value at bar n. A missing close in the window, or a non-positive HC, is unavailable. OpenCandle uses Williams' 22 bars (about one trading month).

## Standard defaults
Length 22 (Williams; OpenCandle). Williams' original adds Bollinger-style bands and a percentile test on the fix, which this indicator does not draw.

## Reading it
The value is a percent drawdown of the low from the recent peak, always zero or positive. High spikes mark fear. It does not give tops: it stays low in rising markets.

## Common mistakes and edge cases
- Confusing it with Wilder's Volatility Index (the Volatility stop tool), which is a different method that shares the name.
- Treating it as the real VIX or comparing absolute levels across instruments without normalising.
- Using the close instead of the low in the numerator.
- Using the highest high instead of the highest close.
- Expecting signals for tops.

## How OpenCandle does it
- This is Williams' VIX Fix, 100 x (highest close of the last 22 bars - low) / highest close. It is not Wilder's Volatility Index; that is the Volatility stop indicator.
- Draws only the fix itself, without Williams' bands or percentile test. Default length is 22.

## Open questions
Williams' original signal rule (bands over the fix) was not verified and is not drawn. The exact formula was not checked against the article.
