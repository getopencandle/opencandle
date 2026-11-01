---
id: chop
name: Choppiness index
kind: indicator
family: trend state
sources:
  - title: Choppiness Index, attributed to Australian trader Bill Dreiss
    author: Bill Dreiss
    year: n/a
    url: book
    type: primary
confidence: low
---

## Purpose
Says whether the market is trending or ranging (choppy), without indicating direction.

## How the author meant it to be used
The Choppiness Index (credited to Bill Dreiss) compares the sum of single-bar true ranges over N bars with the total high-low range over the same N bars. A market that moves in a straight line has a sum of ranges close to its net range (low reading); a sideways market piles up many bars inside a narrow total range (high reading). Common levels are 61.8 (above means choppy, consolidating) and 38.2 (below means trending), taken from Fibonacci ratios. These levels are a convention, not a derived property.

## How you interact with it
Automatic. One input, length. Values are known at bar close and use only the last N bars. It is direction-blind, so it must be paired with a trend or momentum tool.

## Calculation
CHOP(N) = 100 x log10( sum over N bars of ATR(1) / (highest high over N - lowest low over N)) / log10(N), where ATR(1) is the true range of a single bar (max of high-low, |high - prior close|, |low - prior close|). The scale runs from 0 to 100 in theory; a perfectly trending window gives values near 0 and a window whose bars all overlap approaches 100.

## Standard defaults
Length 14 (common). Levels 61.8 and 38.2.

## Reading it
Rising towards or above 61.8 means a consolidation; falling below 38.2 means a trend is in force. A fall from a high reading is often read as a breakout from the range, but the indicator does not give direction.

## Common mistakes and edge cases
- Using the average rather than the sum of true ranges (changes the scale).
- Using close-to-close range instead of the high-low extreme.
- Zero range window (flat bars) makes the ratio undefined.
- Reading it as a direction signal.

## How OpenCandle does it
- Uses Dreiss's formula with a 14-bar default and guides at 61.8 and 38.2.
- The first bar's true range is its high minus low. A window where the highest high equals the lowest low shows no value.

## Open questions
Author, original defaults and the 61.8 / 38.2 levels are not verified against a primary source.
