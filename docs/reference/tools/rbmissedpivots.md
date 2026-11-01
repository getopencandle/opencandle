---
id: rbmissedpivots
name: Rob Booker - Missed pivot points
kind: indicator
family: signals
sources:
  - title: Rob Booker's own materials on missed pivots (not located)
    author: Rob Booker
    year: n/a
    url: book
    type: primary
confidence: low
---

## Purpose
Flags a swing high or low that a normal pivot detector would not report because two pivots of the same kind occurred in a row.

## How the author meant it to be used
Booker's own description is not available. OpenCandle's rule: if two pivot highs occur in sequence with no pivot low between them, the lowest point between them is a "missed" pivot low (mirror for lows). Intent: a clean alternating high-low-high structure is expected, and a gap in it marks a swing that was too shallow for the lookback but still matters. This is OpenCandle's reading and may differ from Booker's own.

## How you interact with it
Automatic overlay with two signals (missed pivot low, missed pivot high) shown as x marks. Set the left and right lookback. Nothing is placed. A pivot needs its right side to be confirmed, so a missed pivot is reported "right-lookback" bars after the second pivot, while its mark sits on its own earlier bar. The mark does not appear at the time of the swing; once drawn it does not move.

## Calculation
A pivot high is a bar whose high is strictly greater than the highs of the left and right lookback bars (strict, no ties); a pivot low mirrors it. Walk pivots in order; when two consecutive pivots are the same kind, locate the opposite extreme between them and mark it. Default lookbacks 10 and 10 (OpenCandle choice).

## Standard defaults
Left 10, right 10.

## Reading it
Use the x marks to complete the alternating swing structure before drawing trendlines, channels or counting waves.

## Common mistakes and edge cases
- Plotting the mark on the detection bar instead of the swing bar (misleading on replay).
- Ties: strict versus non-strict comparison changes which pivots exist.
- Treating the mark as known in real time; it is known only after the right lookback.

## How OpenCandle does it
- Uses a strict pivot test (no ties) with default left and right lookbacks of 10.
- The signal appears on the confirmation bar, right-lookback bars after the second pivot. The x mark sits on the earlier extreme bar, so replay does not leak the future.

## Open questions
Booker's own rule and defaults are not documented; everything here follows OpenCandle's definition.
