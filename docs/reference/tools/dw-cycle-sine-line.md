---
id: dw-cycle-sine-line
name: Sine line
kind: drawing
family: Cycles
sources:
  - title: Stock Market Cycles (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/stock-market-cycles
    type: secondary
confidence: low
---

## Purpose
A sine wave drawn over the chart to represent an idealised cycle, projected forward, so cycle highs and lows can be compared with actual price turns.

## How the author meant it to be used
No single author. ChartSchool describes the ideal cycle as a regular wave: for a 100-day cycle, a first peak at day 25 and the next at day 125, lows at 75 and 175, and the wave crossing the zero axis every half cycle (every 50 days); terms are crest, trough, phase, inflection point, amplitude and length. It stresses that this is a blueprint only; real cycles are not so regular. It lists sinewaves among the annotations it supports.

## How you draw it
Two clicks, left to right. By common practice, point 1 is a cycle low or high and point 2 the next opposite extreme, so the distance is half a cycle (some tools use a full cycle). Both points are draggable; dragging changes period and amplitude. The wave continues to the right as far as the chart extends. Period is in bars, not calendar time. Amplitude comes from the price difference between the points, so the wave stays on its bars and prices across interval changes. On log scale the amplitude should be taken in displayed scale.

## Geometry and levels
y(t) = mid + A * cos(pi * (t - t1) / (t2 - t1)) with mid = (p1 + p2) / 2 and A = (p1 - p2) / 2, for a half-cycle between the points. Zero crossings (inflection points) fall every half period.

## Standard defaults
Half-cycle between the two clicks.

## Reading it
Compare real highs and lows with the wave's crests and troughs; the ChartSchool term "translation" describes peaks coming early or late. The line is a guide and does not predict.

## Common mistakes and edge cases
- Treating the amplitude as a price forecast.
- Mixing half and full cycle definitions between tools.
- Both points at the same bar or price gives a degenerate wave.

## How OpenCandle does it
- P1 is the crest and P2 the next trough (half a period). The wave is drawn across the whole pane.

## Open questions
- Whether the points define half or full period in OpenCandle.
- Verification status: the ChartSchool cycles page was consulted for the ideal cycle terms. The tool details are unverified.
