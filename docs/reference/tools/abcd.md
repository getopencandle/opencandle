---
id: abcd
name: ABCD pattern
kind: drawing
family: harmonic
sources:
  - title: Fibonacci Ratios with Pattern Recognition
    author: Larry Pesavento
    year: 1997
    url: book
    type: primary
  - title: Harmonic Trading, Volume One
    author: Scott Carney
    year: 2010
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
A four-point measured-move pattern: a leg (AB), a retracement (BC), and a second leg (CD) that is expected to be similar in size to AB. It is the simplest harmonic structure and is embedded inside the five-point patterns.

## How the author meant it to be used
ChartSchool lists AB=CD among the harmonic patterns and says all 5-point patterns contain 3-point (ABC) or 4-point (ABCD) structures. Pesavento and Carney use it as a projection: after seeing A, B and C, the target for D is where CD equals AB, often cross-checked against a 1.272 or 1.618 projection of BC. Pesavento also stresses time symmetry: CD often takes about as many bars as AB. D is a place to look for reversal, not a signal alone.

## How you draw it
Four clicks in time order: A, B, C, D. A to B is the first leg, B to C the counter-move, C to D the second leg in the same direction as AB. Bullish ABCD: A high, B low, C a lower high (a retracement up of AB that stays below A), D below B (or the mirrored form). Points alternate high and low and are draggable. The tool draws AB, BC, CD, usually with the AC and BD diagonals and ratio labels. Points stay on their price and time when the interval changes. Ratios compare prices; time symmetry compares bar counts or time spans (the drawing is in time).

## Geometry and levels
- BC retraces AB by 0.382 to 0.886; 0.618 and 0.786 are the ideal values most cited.
- CD = AB (1.0) is the classic equality target; CD / BC lies about 1.13 to 2.618, with 1.272 and 1.618 as the favoured projections. A common rule couples them: a shallower BC (0.382) pairs with a larger projection (about 2.24 to 2.618), a deeper BC (0.886) with a smaller one (1.13 to 1.27).
- Time: the duration of CD often approximates AB.
Sources differ somewhat on these ratio pairs; the values here reflect the common agreement among secondary descriptions.

## Standard defaults
Legs plus ratio labels BC/AB and CD/BC; D is a self-placed point.

## Reading it
D completes the move; a reversal or at least a pause is expected near it. The caution common to all harmonic work is that the ratio match is approximate and context (trend, higher time frame) matters.

## Common mistakes and edge cases
- C beyond A (no longer a retracement) is not a valid ABCD.
- Measuring time in calendar days instead of bars, which ignores weekends and gaps.
- Very small ABs give meaningless ratios.
- Log scale: equal-percentage legs differ from equal-price legs.

## How OpenCandle does it
- Prints BC/AB and CD/BC only. There is no CD/AB equality ratio and no time-symmetry reading.
- Harmonic patterns draw above the candles.

## Open questions
- Whether the app shows time symmetry labels and whether they count bars or calendar time.
- Whether CD=AB uses price difference or percentage on log charts.
- Verification status: only the ChartSchool pages (and web search snippets for the Cypher, Three Drives, Gann angle, Schiff and value-area details) were actually retrieved. Every book citation in the sources list, and the claims attributed to those books, are from memory and unverified.
