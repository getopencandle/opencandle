---
id: chopzone
name: Chop zone
kind: indicator
family: trend state
sources:
  - title: No primary source located; community indicator with no known single author
    author: unknown
    year: n/a
    url: book
    type: primary
confidence: low
---

## Purpose
Colours a histogram by how steeply a moving average is rising or falling relative to recent range, so trending stretches stand out from choppy, flat ones.

## How the author meant it to be used
There is no identifiable original author or publication. The idea is the common practice of classifying the slope of an exponential moving average into zones (strong up, weak up, flat, weak down, strong down) and colouring bars by zone, so a trader can avoid trend-following signals when the slope is flat ("chop").

## How you interact with it
Automatic. Inputs: EMA length, range length and source. The colours are derived, nothing is placed. The value for a bar is known at that bar's close and does not look ahead; the forming bar's zone can change until it closes.

## Calculation
OpenCandle's definition (OpenCandle-defined, not claimed to match any other tool): slope of the EMA per bar, expressed as a percentage of the recent high-low range over the range length, bucketed by edges at 4, 2, 1, 0.5, -0.5, -1, -2, -4 into nine coloured zones. The bar height is constant; only the colour carries information. A hidden "EMA slope" series holds the numeric value.

## Standard defaults
EMA 34 and range 30 in OpenCandle. These are OpenCandle choices, not an author's.

## Reading it
Centre zones (flat colour) mean chop; outer zones mean steep trend in that direction. Because the thresholds are OpenCandle-defined, the same chart can look different in other software.

## Common mistakes and edge cases
- Assuming colours or thresholds match other platforms' Chop Zone indicator.
- Confusing it with the Choppiness Index (Dreiss), which is a different, ATR/range-based number.
- Zero range window gives an undefined slope normalisation.

## How OpenCandle does it
- This is OpenCandle's own definition, not a copy of any other platform's Chop Zone.
- Slope is 100 x (EMA - previous EMA) / (highest high - lowest low over the range length), so it is a percent of the recent range per bar.
- The slope is sorted into nine coloured zones with edges at 4, 2, 1, 0.5, -0.5, -1, -2 and -4. The EMA starts from a simple average.
- A flat range or a missing value shows no bar. Defaults are EMA 34 and range 30.

## Open questions
No authoritative formula exists to check against; the bucket edges, defaults and colours cannot be validated.
