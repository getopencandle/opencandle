---
id: cypher
name: Cypher pattern
kind: drawing
family: harmonic
sources:
  - title: Harmonic Trading, Volume Two (Cypher section)
    author: Scott Carney
    year: 2010
    url: book
    type: primary
  - title: Cypher pattern
    author: Darren Oglesbee
    year: 2000
    url: book
    type: primary
  - title: Harmonic Patterns (ChartSchool)
    author: Suri Duddella
    year: 2014
    url: https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/harmonic-patterns
    type: secondary
confidence: low
---

## Purpose
A five-point XABCD harmonic reversal pattern in which C extends beyond A, unlike the Gartley family where all later points stay inside the XA leg's range.

## How the author meant it to be used
Attributed to Darren Oglesbee and described by Scott Carney in his Harmonic Trading series; authorship rests on secondary statements, as Oglesbee's original text is not available. ChartSchool lists the Cypher among the 5-point patterns with embedded ABC/ABCD structure and the same entry logic as other harmonic patterns: D is where the pattern completes, a reversal is anticipated there, and confirmation plus stops matter.

## How you draw it
Five clicks in time order: X, A, B, C, D. In a bullish Cypher: X low, A high, B a pullback low, C a new high above A, D a pullback low. Points alternate high and low and all are draggable. The tool draws XA, AB, BC, CD and the connectors used for the ratios (notably XC). Points are in time and price, so they stay fixed on the chart across interval changes while ratios are re-measured. Measure in the displayed price scale.

## Geometry and levels
Commonly given ratios (several secondary sources agree on the shape; they disagree on one reference leg):
- B retraces 0.382 to 0.618 of XA.
- C extends 1.272 to 1.414 of XA, i.e. XC / XA = 1.272 to 1.414 (C beyond A). One source instead measures this against AB; the XA reading is the more common and is used here.
- D retraces 0.786 of the whole XC leg, so CD / XC = 0.786.
These are secondary-only; verify against Carney's book.

## Standard defaults
Legs and ratio labels; 0.786 of XC as the D target. No other defaults.

## Reading it
As with other harmonics, D is a zone to watch for reversal, not an automatic entry; ChartSchool recommends waiting for confirming price action. Published win-rate claims for the Cypher are weak and should not be relied on.

## Common mistakes and edge cases
- Using the Gartley rule (C inside A) which excludes the Cypher.
- Measuring the 0.786 against XA or CD instead of XC.
- Points not alternating, or C not beyond A.
- Log scale and extremely large XC distort the 0.786 level.

## How OpenCandle does it
- The pattern is marked valid only when the points go the right way: C beyond A, B between X and A, D between X and C, and the ratios inside their bands.
- Ratio bands are 0.382 to 0.618 for B, 1.272 to 1.414 for C and about 0.74 to 0.83 for D (0.786 of XC).
- Harmonic patterns draw above the candles.

## Open questions
- Which leg C is measured against in Carney's text (XA vs AB).
- Whether OpenCandle enforces the C > A condition or only labels ratios.
- Book citations in the sources list are background reading and were not re-checked line by line.
