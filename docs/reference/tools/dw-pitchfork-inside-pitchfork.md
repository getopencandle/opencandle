---
id: dw-pitchfork-inside-pitchfork
name: Inside pitchfork
kind: drawing
family: pitchfork
sources:
  - title: Andrews' Pitchfork (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/andrews-pitchfork
    type: secondary
  - title: The Best Trendline Methods of Alan Andrews and Five New Trendline Techniques
    author: Patrick Mikula
    year: 2000
    url: book
    type: secondary
confidence: low
---

## Purpose
A pitchfork variant whose median line starts from a point inside the first swing rather than at the first pivot, to give a flatter or more centred fork when the first pivot is extreme.

## How the author meant it to be used
Alan Andrews taught the median line method (see the Andrews pitchfork file). Later variants, notably Schiff and Modified Schiff, move the median line's starting point (Schiff to halfway along price between P1 and P2, Modified Schiff to halfway in both price and time). 'Inside pitchfork' is not a term found in the Andrews literature, so details differ between sources.

## How you draw it
Three clicks as for the Andrews pitchfork: point 1 (anchor), then points 2 and 3, the next two pivots of opposite kind. The inside variation changes only where the median line starts, not the click order. All points are draggable. The lines extend to the right.

## Geometry and levels
M = midpoint of P2 and P3. The median line is the ray from a start point S through M, with parallels through P2 and P3. For an inside fork S is the midpoint of segment P1-P2, halfway in time and in price, and OpenCandle draws it that way. Its median line runs from M parallel to the line from S to P2, with the outer lines parallel to it, and a construction line joins S to P2. S = P1 gives the standard Andrews fork. A shifted S flattens or steepens the median line. Build the fork in the displayed scale.

## Standard defaults
Median line plus two parallels. S is the midpoint of P1-P2.

## Reading it
Read as an Andrews fork: price tends to return to the median line (often cited as about 80 percent of the time, a secondary claim); outer lines are support and resistance; a break of an outer line signals a trend change.

## Common mistakes and edge cases
- Treating it as identical to Schiff or Modified Schiff without checking S.
- Wrong click order for P2 and P3 distorts the fork.
- A very small P2-P3 gap makes the outer lines nearly coincide with the median line.
- Log versus linear build.

## How OpenCandle does it
- The origin is the midpoint of the first two points: halfway in bars and halfway on screen in price. On a log chart it sits on the construction line.
- The median starts at the midpoint of P2 and P3 and runs parallel to the line from the origin to P2. The outer lines are parallel to it, and a construction line joins the origin to P2.

## Open questions
- Whether the median line should pass through S and M, as the usual median line does, is not verified.
- Low confidence; only the Andrews pitchfork ChartSchool page covers the base method.
- Book citations in the sources list are background reading and were not re-checked line by line.
