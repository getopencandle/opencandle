---
id: dw-channel-disjoint-channel
name: Disjoint channel
kind: drawing
family: channels
sources:
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
Two trend lines forming a channel whose edges are drawn independently, so they need not share endpoints or be parallel. It outlines a trend whose boundaries are not strictly parallel.

## How the author meant it to be used
No known author or published method; it is a charting software feature. The idea follows ordinary trend channel practice, where the upper and lower trend lines are each drawn through their own swing points.

## How you draw it
Four clicks are typical for this kind of tool: points 1 and 2 set the first line and points 3 and 4 the second. OpenCandle's actual click order has not been verified and must be checked in the application. Each point is draggable independently, so the edges can be edited without affecting each other. Connectors join the edges at the ends to close the band.

## Geometry and levels
Line A through (t1,p1),(t2,p2) and line B through (t3,p3),(t4,p4). The area between them is filled. The lines need not be parallel, so width varies along the channel. Each line is straight in the displayed scale.

## Standard defaults
Two lines with a fill; no middle line.

## Reading it
As a channel: a boundary touch tests support or resistance. A widening channel suggests rising volatility and a narrowing one a squeeze.

## Common mistakes and edge cases
- Do not use Parallel channel semantics (third point offset) here.
- Crossed point orders make a self-intersecting fill; it should draw without error.
- Interval change keeps four anchors.

## How OpenCandle does it
- Four free points (top 1, top 2, bottom 1, bottom 2) with a fill between the two lines.

## Open questions
- Exact click count and which points belong to which line need observation.
- Low confidence: no source describes this tool.
