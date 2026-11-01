---
id: xabcd
name: XABCD harmonic pattern
kind: drawing
family: harmonic
sources:
  - title: Profits in the Stock Market
    author: H. M. Gartley
    year: 1935
    url: book
    type: primary
  - title: Harmonic Trading, Volume One
    author: Scott Carney
    year: 2010
    url: book
    type: primary
  - title: Fibonacci Ratios with Pattern Recognition
    author: Larry Pesavento
    year: 1997
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
A five-point swing template (X, A, B, C, D) used to check whether four connected swings match the Fibonacci ratios of a harmonic pattern (Gartley, Bat, Butterfly, Crab and others), and to project the reversal zone at D.

## How the author meant it to be used
H. M. Gartley described a five-point "222" pattern in his 1935 book (ChartSchool dates it 1932; the book is 1935, so the earlier date looks like an error in the secondary source). Larry Pesavento added Fibonacci ratio rules in 1997. Scott Carney's Harmonic Trading books formalised ratio ranges and added the Bat, Crab, Butterfly and later patterns. The trade idea: X to A is the initial leg, B retraces part of it, C retraces part of AB, and D completes the pattern in a Potential Reversal Zone where several ratios from different legs cluster. Traders then look for reversal confirmation at D, with the stop just beyond X or the pattern's invalidation point. Carney's patterns are exact ratio sets; the generic XABCD tool is only the five-point shape and does not enforce any single pattern.

## How you draw it
Five clicks in time order: X, A, B, C, D, alternating high and low (for example X low, A high, B low, C high, D low for a bullish pattern). Each point is a pivot, not a free point. All points are draggable. The tool draws the legs XA, AB, BC, CD plus the XB and AC (and often BD, XD) connectors and labels the measured ratios. Points are in time and price, so they stay on their bars when the interval changes, and the ratios are re-measured from the new positions. Ratios must be measured in the displayed price scale; on a log chart harmonic traders usually measure in log space or avoid pattern work across very large ranges. The tool measures prices, not bar counts, though some practitioners also compare leg durations.

## Geometry and levels
The ratios compared (Carney convention, ranges follow the books and agree with the ChartSchool article):
- B: retracement of XA, the leg ratio AB / XA (printed on the X-B diagonal).
- C: retracement of AB, the leg ratio BC / AB (on the A-C diagonal), typically 0.382 to 0.886.
- D: both a retracement or extension of XA, the leg ratio AD / XA (on the X-D diagonal), and a projection of BC, CD / BC (on the B-D diagonal).

These are leg ratios, not diagonal lengths: XB, AC, BD and XD are only the lines the ratios are printed on. For a D between X and A, XD / XA = 1 - AD / XA, so a 0.786 Gartley D would read 0.214 as XD / XA.

Standard pattern ratios (bullish shown; mirror for bearish):

| Pattern | B (of XA) | C (of AB) | D (of XA) | BC projection |
|---|---|---|---|---|
| Gartley | 0.618 | 0.382 to 0.886 | 0.786 | 1.13 to 1.618 |
| Bat | 0.382 to 0.50 | 0.382 to 0.886 | 0.886 | 1.618 to 2.618 |
| Butterfly | 0.786 | 0.382 to 0.886 | 1.27 (to 1.618) | 1.618 to 2.24 |
| Crab | 0.382 to 0.618 | 0.382 to 0.886 | 1.618 | 2.24 to 3.618 |

ChartSchool (Duddella) gives the Gartley completion zone as 0.78 XA, 1.27 and 1.62 of BC, and AB=CD; target zone 1 is D plus 0.62 to 0.786 of XA, target zone 2 is D plus 1.27 to 1.62 of XA. Tolerances of a few percent are normal; tools differ in strictness.

## Standard defaults
The generic tool shows XA, AB, BC, CD legs and ratio labels without a pattern name. Pattern names (if any) are only a nearest-match label.

## Reading it
Harmonic patterns are reversal setups. The author-level caution (Duddella, summarising Carney) is that D is a zone to watch for reversal evidence, not a signal to enter blindly; confluence of legs, market context and trend matter, and patterns can fail with well-defined invalidation levels. ChartSchool lists as disadvantages that identification is subjective and conflicting ratios are common.

## Common mistakes and edge cases
- Points not alternating high and low; D beyond X for patterns where D must stay inside (Gartley, Bat) invalidates the pattern.
- Mixing up "retracement of XA" with "extension of XA" for D.
- Using closing prices for some points and wicks for others.
- Log scale and very tall patterns distort ratios.
- Very small legs make ratios noisy.

## How OpenCandle does it
- A generic five-point shape: no pattern name and no validity mark.
- Prints AB/XA, BC/AB, CD/BC and AD/XA on the XB, AC, BD and XD diagonals.
- Harmonic patterns draw above the candles.

## Open questions
- Whether the app names the pattern or only prints ratios.
- Exact ratio ranges above are from memory of Carney; they need checking against the books.
- Whether D is allowed to float freely (a forecast) or must be a completed pivot.
- Verification status: only the ChartSchool pages (and web search snippets for the Cypher, Three Drives, Gann angle, Schiff and value-area details) were actually retrieved. Every book citation in the sources list, and the claims attributed to those books, are from memory and unverified.
