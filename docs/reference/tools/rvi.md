---
id: rvi
name: Relative volatility index
kind: indicator
family: volatility / oscillator
sources:
  - title: The Relative Volatility Index, Technical Analysis of Stocks & Commodities, V.11:6, pp. 253-256
    author: Donald Dorsey
    year: 1993
    url: https://store.traders.com/-v11-c06-therela-pdf.html
    type: primary
  - title: TA-Lib function description for RVI
    author: TA-Lib project
    year: n/a
    url: https://ta-lib.org/functions/rvi.html
    type: secondary
confidence: low
---

## Purpose
An RSI-style 0 to 100 oscillator where the quantity being smoothed is volatility (a rolling standard deviation) sorted by whether price is rising or falling, instead of the price change itself.

## How the author meant it to be used
Dorsey, 1993. He intended it as a confirming filter for another trend or momentum signal, not a standalone system: take a long entry only when RVI is above 50 and a short only when it is below 50 (per published summaries). Values above 50 say volatility is mostly on the up days, below 50 mostly on the down days.

## How you interact with it
Automatic. You set the standard deviation length, smoothing length and source. Nothing placed. Known at bar close; the live bar changes while forming. The smoothing is recursive, so early values depend on the starting point.

## Calculation
Per bar compute the standard deviation of the source over the std length. If the source rose versus the prior bar, put the std into the up bucket (down gets zero); if it fell, into the down bucket; if unchanged, both zero (variants split it). Smooth both with a Wilder-type average over the smoothing length. RVI = 100 x up / (up + down). Sources disagree on the smoothing: published summaries mention EMA for the classic version and Wilder smoothing (seeded with the simple average) for others; and the 1993 form uses closes while a 1995 revision averages the index of highs with the index of lows.

## Standard defaults
Std length 10, smoothing length 14 (Dorsey per secondary sources). Threshold 50.

## Reading it
Above 50 volatility on upside, below 50 on downside; use only alongside a primary signal. Not to be confused with the Relative vigor index.

## Common mistakes and edge cases
- Mixing it up with RVGI.
- Using the standard deviation of price changes instead of price.
- Using sample versus population standard deviation without noting it.
- Unchanged bars.

## How OpenCandle does it
- Uses Dorsey's 1993 form: 10-bar population standard deviation of closes, split into up and down buckets and smoothed with Wilder smoothing over 14. It does not use the 1995 high/low version.
- Some tools use an EMA or the sample standard deviation instead.

## Open questions
Sources differ on smoothing type, standard deviation definition, and the 1993 versus 1995 version; OpenCandle's choices are listed above.
