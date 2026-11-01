---
id: pivotshl
name: Pivot points high/low
kind: indicator
family: swing points
sources:
  - title: Swing-point (fractal) pivot definition (common charting convention; no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
Marks swing highs and swing lows: a bar whose high is higher than the highs of a set number of bars on each side, or whose low is lower than the lows around it. Not related to the floor-trader pivot-point levels (see Pivot points standard).

## How the author meant it to be used
No single author; the swing/fractal idea is generic and older than software charting. Swing points are the raw material for trendlines, support and resistance and pattern recognition.

## How you interact with it
Automatic. You set bars to the left and right for highs and for lows. Important: a pivot cannot be known when it forms. It is confirmed only after Right more bars have passed without exceeding it, so the marker is placed on the pivot bar itself but appears Right bars late. The newest Right bars can never carry a pivot, and a historical chart looks cleaner than real time. Using the pivot for trades at its own bar is look-ahead.

## Calculation
Pivot high at bar i: high[i] > high[i-k] for k = 1..Left and high[i] > high[i+k] for k = 1..Right (strict). Pivot low: low[i] < the lows on both sides likewise. With strict comparison an equal neighbour cancels the pivot; some implementations use greater-or-equal on one side.

## Standard defaults
Commonly 5 and 5 or similar; OpenCandle uses 10/10 (OpenCandle-chosen).

## Reading it
Connect alternating Pivot points standard for trendlines, treat prior Pivot points standard as support and resistance, test for higher highs and higher lows.

## Common mistakes and edge cases
- Treating the marker as available at the pivot bar.
- Asymmetric left/right lengths change lag.
- Flat tops with equal highs produce no pivot under strict comparison.
- Needs at least Left + Right + 1 bars.

## How OpenCandle does it
- Strict comparison on both sides: an equal neighbour cancels the pivot.
- The marker sits on the pivot bar but only appears Right bars later, and the newest Right bars never carry one.
- Default is 10 bars on each side.

## Open questions
Tie handling is implementation-specific.
