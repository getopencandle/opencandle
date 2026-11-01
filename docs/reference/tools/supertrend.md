---
id: supertrend
name: Supertrend
kind: indicator
family: trend
sources:
  - title: Supertrend (credited to Olivier Seban; original not located)
    author: Olivier Seban
    year: n/a
    url: n/a
    type: primary
  - title: Wilder's ATR as defined in New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: secondary
confidence: medium
---

## Purpose
A trailing stop-style trend line built from ATR bands around the bar midpoint; it flips side when price closes through it, giving a simple trend direction.

## How the author meant it to be used
Supertrend is commonly credited to Olivier Seban; no original text is cited here, so this follows common practice. The line sits under price in an uptrend (acting as a trailing stop) and above price in a downtrend. A close through the line flips the trend and the line jumps to the other side. It works in trending markets and whipsaws in ranges.

## How you interact with it
Automatic overlay. Set ATR length and factor. Nothing is placed. The line and the trend state use only the current and earlier bars; a flip is known at the close of the bar that closes through the line. During a live bar the flip can appear and disappear until the bar closes. Two colours show up and down trend.

## Calculation
hl2 = (high + low) / 2. Basic upper = hl2 + factor x ATR; basic lower = hl2 - factor x ATR. Final upper = basic upper if it is lower than the previous final upper or the previous close was above the previous final upper, else carry the previous final upper; final lower mirrors (higher than previous, or previous close below previous final lower). Trend flips up when close > final upper and down when close < final lower; Supertrend = final lower in an uptrend, final upper in a downtrend. ATR is Wilder's average of true range in OpenCandle (first true range is high - low). Warm-up bars before the ATR exists are not a signal.

## Standard defaults
ATR 10, factor 3 are the common values (OpenCandle uses them).

## Reading it
Trade in the direction of the line colour; the line distance is a stop. A larger factor gives fewer, later flips.

## Common mistakes and edge cases
- ATR smoothing method differs between tools (Wilder versus simple average) and moves flips.
- Forgetting the carry-forward rule makes the line ratchet incorrectly.
- Flips on a live bar are not final.
- Gaps and missing bars should carry the bands, not reset them.

## How OpenCandle does it
- Uses Wilder's ATR, with the first true range taken as high minus low. Defaults are length 10 and factor 3.
- The bands carry forward from the previous bar, and bars with a gap carry them as well.
- The first trend before any flip is a downtrend.

## Open questions
Seban's original defaults and the ATR smoothing he intended are not verified.
