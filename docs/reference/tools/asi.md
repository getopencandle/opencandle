---
id: asi
name: Accumulative swing index
kind: indicator
family: trend
sources:
  - title: New Concepts in Technical Trading Systems
    author: J. Welles Wilder Jr.
    year: 1978
    url: book
    type: primary
confidence: low
---

## Purpose
Turns each bar's open, high, low and close, together with the previous bar's, into a swing index between -100 and +100, and accumulates it into a line that follows the "real" strength of the market and is meant to confirm or contradict price breakouts.

## How the author meant it to be used
Wilder introduced the Swing Index and its running total, the Accumulation Swing Index, in New Concepts (1978), designed for futures, where the daily limit move sets the scale. As Wilder described it, he used the ASI like a second price chart. A break of an ASI swing high or low, confirmed by price breaking the corresponding extreme, is a real breakout; if price breaks out and ASI does not, the breakout is suspect. He also drew trendlines on ASI and looked for divergences. The swing index is also used to find the high swing point (HSP) and low swing point (LSP) for the system's reversal rules.

## How you interact with it
Automatic. One input, the limit move value (default 10). It does not need placement. The value on each bar is final at that bar's close, but it needs the previous bar, so the first bar has no swing.

## Calculation
As Wilder defines it:
SI = 50 x ((C - Cy) + 0.5 x (C - O) + 0.25 x (Cy - Oy)) / R x (K / T), where y means the previous bar, K = the larger of |H - Cy| and |L - Cy|, and T is the limit move.
R depends on which of |H - Cy|, |L - Cy| or |H - L| is largest (ties go to |H - Cy|, then |L - Cy|, then |H - L|). OpenCandle uses the absolute-value form shown here for the selection. If |H - Cy| is largest: R = |H - Cy| - 0.5 x |L - Cy| + 0.25 x |Cy - Oy|. If |L - Cy| is largest: R = |L - Cy| - 0.5 x |H - Cy| + 0.25 x |Cy - Oy|. If |H - L| is largest: R = |H - L| + 0.25 x |Cy - Oy|.
ASI is the running total of SI.

## Standard defaults
T is the market's limit move. Platforms without a limit usually default to a constant (OpenCandle uses 10, under the input title "Limit move value"). T is a pure linear divisor at any value, with no clamp in the formula, so changing it only rescales the line and never changes its shape.

## Reading it
Rising ASI while price rises confirms the trend; failure of the ASI to make a new high with price signals weakness. Breakouts are judged by ASI swing points.

## Common mistakes and edge cases
- Scaling: T only rescales the line and SI is not clamped, so a wrong T changes the magnitude but not the shape.
- Zero divisor R: the swing index is 0.
- Treating the start value as arbitrary; the line is only meaningful relative to itself.
- Mixing up the Swing Index (per bar) with the accumulated line.

## How OpenCandle does it
- R is chosen with the absolute-value form. Ties go to |H - Cy|, then |L - Cy|, then |H - L|. Some documentation writes the terms with signs instead.
- The limit move value T defaults to 10. It is a plain linear divisor, and the swing index is not clamped.
- The first bar has no previous bar and shows no value. If R is 0, the swing is 0. A bar with a missing price adds nothing.
- The zero line is OpenCandle's addition.

## Open questions
Some documentation writes the R terms with signs rather than absolute values; Wilder's own text would settle which form is intended. The first bar has no previous bar and so is unavailable.
