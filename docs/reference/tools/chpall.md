---
id: chpall
name: All chart patterns
kind: pattern
family: aggregate
sources:
  - title: Common charting convention (see the individual pattern files)
    author: n/a
    year: n/a
    url: book
    type: secondary
confidence: medium
---

## Purpose
One indicator that runs all 16 chart patterns (flags, pennants, cup and handle and its inverse, double and triple tops and bottoms, head and shoulders and its inverse, rectangle, triangle, rising and falling wedges) together, so one add shows every pattern OpenCandle can find.

## How the author meant it to be used
There is no author; this is a convenience bundle. Each contained pattern follows its own source (Edwards and Magee, Bulkowski, O'Neil, ChartSchool); see the individual pattern files. Sources agree that patterns are read in context, with prior trend and volume, which the bundle does not add.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag; you cannot move the points of a detected pattern. Add it from the Patterns tab of the Indicators dialog. Inputs: Pivot length (default 5, range 2 to 50), Tolerance % (default 2, range 0.1 to 50), 'Require breakout confirmation (every pattern)' (on for new instances, off for ones saved before it existed) and 'Textbook size rules' (on for new instances, off for ones saved before it existed). The indicator first finds confirmed swing pivots: a bar is a pivot high (low) only when it is the extreme of the Pivot length bars on each side, so a pivot is known only Pivot length bars after it happened. The pattern is then matched on the latest pivots. With breakout confirmation on, the signal is on the breakout bar, the first close through the pattern's boundary (see each pattern's file for the exact line), not on the last pivot. With it off, the pattern is signalled on the bar that confirms its last pivot, which is before any breakout, so it is a shape alert only. The named marker is drawn back on the last pivot, and its tooltip says "Known on <date>", the date the pattern could first be seen; a small dot in the same colour marks the signal bar. For alerts and backtests use the signal bar, not the marker. Past signals do not repaint as new bars arrive. Tolerance is the percent within which two levels count as equal, so it directly sets how strict 'equal highs' or 'parallel' is, and a larger Pivot length finds fewer, bigger patterns later. Bullish, bearish and neutral signals are separate plots. Markers on one bar and direction are combined into one marker with the names on separate lines.

## Calculation
The union of the 16 individual detectors on the same zigzag with the same Pivot length and Tolerance. Direction per pattern: bullish (double and triple bottom, inverted H&S, bull flag and pennant, cup and handle, falling wedge), bearish (double and triple top, H&S, bear flag and pennant, inverted cup and handle, rising wedge), neutral (rectangle, triangle).

## Standard defaults
OpenCandle defaults: Pivot length 5, Tolerance 2%. These numbers, the pivot method and every detection rule are OpenCandle's own choices; none of the sources specify them (the authors teach visual pattern recognition, with price filters such as 3% or a 3-day hold as optional breakout confirmation).

## Reading it
Read each marker by its own pattern name and apply that pattern's file. A busy chart is normal because the shapes overlap (a triple top contains a double top; wedges and triangles share pivots).

## Common mistakes and edge cases
- Reading every marker as a signal. With breakout confirmation off, markers are shape alerts, not confirmed breakouts.
- Overlapping reports of the same price action under different names.
- Markers are drawn on pivot bars earlier than the bar the signal was known.

## How OpenCandle does it
- Finds swing pivots with Pivot length (default 5) bars on each side, so a pattern is known only after its last pivot is confirmed. Tolerance defaults to 2%.
- Looks only at pivot prices. Volume and price targets are not tested; prior trend, spacing and duration are tested only by Textbook size rules (below).
- Every one of the 16 patterns has a breakout rule, and the one option covers them all. Tops, bottoms and head and shoulders: a close through the valley, peak or neckline. Flags and pennants: a close beyond the boundary line on the side of the pole's direction, cancelled by a close past the other line or the pole midpoint. Cup and handle: a close beyond the higher (lower) rim. Wedges: a close through the line that breaks the wedge. Rectangle and triangle: the first close outside either line, with the side named in the tooltip.
- A breakout must come within as many bars after the last pivot as the pattern itself spans. A close past the pattern's far side first cancels it.
- The marker is drawn on the last pivot. Its tooltip says "Known on <date>" and a small dot marks the bar where the signal actually appears, so history never looks as if the pattern was known earlier. Signals never repaint.
- "Require breakout confirmation" is on for new instances. Turn it off to get the shape alert on the bar that confirms the last pivot. Instances saved before the option existed keep it off.
- Bullish, bearish and neutral signals are separate plots. Markers on one bar and direction are combined into one marker with the names on separate lines.
- The line drawn for a breakout is the level the rule tests: flat at the valley (double top), peak (double bottom), lowest valley or highest peak (triple), or the higher or lower rim (cups); the sloped neckline for head and shoulders; the two boundary lines, stopped at the apex, for triangles and wedges.
- Textbook size rules (on for new instances; off for instances saved before it existed; applied only on daily and longer bars, intraday bars are never changed): A double top needs the valley between its tops at least 10% below the first top (a double bottom: the rise between its bottoms at least 10% above the first bottom) and the two tops at least 10 bars apart (Bulkowski, "at least 10%, but allow exceptions", and his tests used a two-week minimum; ChartSchool, "Double Top Reversal", "at least 10%"). A reversal pattern (double, triple, head and shoulders and their inverses) needs a prior trend: going back from the bar before its first pivot, the first bar that trades outside the pattern's price range must lie below it for a top and above it for a bottom, meaning price came from beyond the pattern's far side (Bulkowski glossary, ChartSchool). Only bars before the first pivot are read. Known quirk: a retest of a slightly higher earlier peak can read as the wrong trend. A triangle, rectangle, rising wedge or falling wedge spans at least 15 bars from its first to its last pivot, three weeks of daily bars (Bulkowski, "3 weeks is the minimum duration"; ChartSchool: under three weeks is a flag or pennant). Flags, pennants and cups are unchanged.

## Open questions
- Whether overlapping patterns should be de-duplicated.
