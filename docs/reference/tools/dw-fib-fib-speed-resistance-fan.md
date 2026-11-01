---
id: dw-fib-fib-speed-resistance-fan
name: Fib speed resistance fan
kind: drawing
family: Fibonacci
sources:
  - title: Speed Resistance Lines (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/speed-resistance-lines
    type: secondary
  - title: Fibonacci Fans (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-fans
    type: secondary
  - title: Edson Gould's speed resistance lines
    author: Edson Gould
    year: 1960
    url: book
    type: primary
confidence: low
---

## Purpose
A set of rays from one pivot that fan out through fractions of the move to the second point, giving sloped support and resistance lines that advance with time.

## How the author meant it to be used
Per ChartSchool, Edson Gould (1960s and 70s) built speed resistance lines on the one-third and two-thirds points of a move: the first line runs from the extreme low (or high) to the opposite extreme, and further lines run from the same start through the 1/3 and 2/3 points. ChartSchool's Fibonacci fans do the same with the 38.2, 50 and 61.8 percent retracements: rising fans start at the trough, falling fans at the peak. The "Fib speed resistance fan" tool merges the two ideas;

## How you draw it
Two clicks, left to right. Point 1 is the start pivot (trough for an advance, peak for a decline); point 2 is the opposite extreme. Both are draggable. Each ray starts at point 1 and passes through the point on the vertical line at point 2's time that sits at ratio r of the price distance from point 1 to point 2. Rays extend right to the chart edge. The geometry is in time and price, so rays stay on their anchors across interval changes. On a log scale the ratio points should be taken in the displayed scale, otherwise the fan looks kinked.

## Geometry and levels
Ray r passes through (t1, p1) and (t2, p1 + r * (p2 - p1)). Ratio 0 is a flat line at p1 (OpenCandle draws this); ratio 1 is the line to point 2. Gould's levels are 1/3 and 2/3. The Fibonacci fan levels are 0.382, 0.5 and 0.618. Many tools also add a second set of rays to the horizontal edge (time fractions); that is a software extension not found in the pages consulted.

## Standard defaults
Gould: 0.333 and 0.667 plus the main line. Fibonacci fan: 0.382, 0.5, 0.618. Tools often offer both sets together.

## Reading it
Per ChartSchool a fan "estimates support levels or potential reversal zones". A pullback holding a fan line is support in an advance; after a break, price often heads for the next line.

## Common mistakes and edge cases
- Wrong start pivot: for a rising fan point 1 must be the low.
- Mixing scales between the points and the display.
- Very short moves give steep fans that mean little.

## How OpenCandle does it
- Draws rays from point 1 through the ratio of the price move at point 2's bar, plus time rays through the ratio of the time span at point 2's price, in the drawn direction.
- The ratio is measured from point 1. The default set is 0, 0.236, 0.382, 0.5, 0.618, 0.786 and 1; Gould's 1/3 and 2/3 are not default.

## Open questions
- Whether OpenCandle also draws the horizontal-edge rays.
- The exact default ratio list in OpenCandle (not confirmed from code).
- Verification status: the ChartSchool pages on speed resistance lines and Fibonacci fans were consulted. The merged tool has no confirmed author.
