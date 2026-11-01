---
id: dw-elliott-elliott-triangle-wave
name: Elliott triangle wave (A-B-C-D-E)
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
confidence: low
---

## Purpose
Labels a five-leg sideways triangle correction (A, B, C, D, E) in which the legs converge.

## How the author meant it to be used
In the wave principle a triangle is a sideways correction of five overlapping legs labelled A-B-C-D-E, each leg in three waves (a 3-3-3-3-3 structure), with the legs contracting toward an apex (a few triangles expand). From Frost and Prechter: a contracting triangle forms where a fourth wave, a B wave, or the last correction before the final move would be, never as wave 2; after the triangle, price makes a short thrust in the prior trend's direction. A line drawn through A, C and E and another through B and D bound it. The ChartSchool introduction does not detail triangles, so treat this as general guidance.

## How you draw it
Six clicks in time order: an unlabelled origin (the start of A), then the ends of A, B, C, D and E (this is OpenCandle's choice, following the other Elliott tools). All six points are draggable. Legs are straight lines. Anchored in time and price; remains on its bars across interval changes. Nothing is checked by the drawing.

## Geometry and levels
Contracting triangle: each leg retraces roughly 0.5 to 0.85 of the one before it, and E ends inside the lines. The boundary lines A-C-E and B-D should converge. The thrust after E is about as long as the widest part of the triangle.

## Standard defaults
Labels A to E. No levels.

## Reading it
It signals a pause before the trend continues. Counts are judgement calls and are revised.

## Common mistakes and edge cases
- Counting a triangle as a wave 2, which the guidelines do not allow.
- Boundary lines that diverge (an expanding triangle, rarer).
- Overlapping legs mislabelled as an impulse.

## How OpenCandle does it
- An unlabelled origin plus A to E (six points). Labels are plain, with no rule checks.

## Open questions
- The exact retracement range between legs.
- Whether OpenCandle draws the converging lines.
- The ChartSchool pages do not cover triangles. Confidence is low.
