---
id: dw-elliott-elliott-correction-wave
name: Elliott correction wave (A-B-C)
kind: drawing
family: Elliott
sources:
  - title: Elliott Wave Principle: Key to Market Behavior
    author: A. J. Frost and Robert R. Prechter Jr.
    year: 1978
    url: book
    type: primary
  - title: Introduction to Elliott Wave Theory (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/market-analysis/elliott-wave-analysis-articles/introduction-to-elliott-wave-theory
    type: secondary
confidence: medium
---

## Purpose
Labels a three-wave correction (A, B, C) against the larger trend, after a five-wave impulse.

## How the author meant it to be used
Elliott's wave principle says motive waves move five-wave in the trend's direction and corrections move against it, usually in three waves labelled A, B, C. ChartSchool notes this can mislead, since not every correction is exactly three waves, and says the cycle of five motive plus three corrective waves forms an eight-wave structure. Frost and Prechter: zigzags are 5-3-5 and flats 3-3-5, where B retraces most of A in a flat and C ends beyond A in a zigzag; a correction often ends near the previous fourth wave of lesser degree. Alternation: where wave 2 is sharp, wave 4 is usually a sideways one.

## How you draw it
Four clicks in time order: an unlabelled origin (the start of A, normally the end of the impulse) and then the ends of waves A, B and C. All four points are draggable. Labels sit on the points A, B, C. The legs are straight lines between points. Anchored in time and price; stays on its bars across interval changes. Drawing does not check any rule. Wave relationships should be judged on both arithmetic and semi-log views for long moves.

## Geometry and levels
Zigzag: B retraces less than 100 percent of A and C ends beyond the end of A, often about 0.618 to 1.0 times A. Flat: B retraces most of A (about 90 percent or more) and C ends near or beyond A. Expanded flat: B beyond the start of A. These ratios are guidelines only.

## Standard defaults
Labels A, B, C; OpenCandle has no ratio levels.

## Reading it
After a complete five-wave impulse expect a three-wave correction; C often ends near an area of support from the previous fourth wave. Counts are provisional and revised as price evolves.

## Common mistakes and edge cases
- Starting the origin at the wrong point (it should be the end of the preceding impulse).
- Treating every pullback as an A-B-C.
- Counting C as an impulse when it is part of a more complex correction.

## How OpenCandle does it
- An unlabelled origin plus A, B and C. Labels sit on pills with no degree notation, and there are no rule checks.

## Open questions
- Whether OpenCandle distinguishes zigzag from flat.
- Verification status: the ChartSchool introduction was consulted for the 5-3 and A-B-C basics.
