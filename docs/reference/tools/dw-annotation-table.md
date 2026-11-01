---
id: dw-annotation-table
name: Table
kind: drawing
family: annotation
sources:
  - title: Common charting convention for annotation and drawing tools
    author: none (no single author)
    year: n/a
    url: book
    type: secondary
confidence: low
---

## Purpose
A grid of text cells placed on the chart for structured information such as levels or a trade plan.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
Click to place the table; edit cells by clicking them; set rows, columns, text and background in settings. In OpenCandle the table is anchored at its top-left corner to a time and price, so it pans with the chart. It starts as a 2 by 2 example, and rows split on line breaks and also on semicolons.

## Geometry and levels
Layout is rows by columns of equal or your own cell size. The anchor is the top-left corner at a time and price, so the table moves when you pan.

## Standard defaults
OpenCandle starts with a 2 by 2 grid.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Resizing columns or rows must not lose cell text.
- Cell text overflow should clip or wrap, not overlap neighbours.

## How OpenCandle does it
- Anchored in time and price at its top-left, so it pans with the chart.
- Rows split on line breaks and also on semicolons, so "Stop; 1.2" becomes two rows. It starts as a 2 by 2 example.

## Open questions
- Whether a screen-fixed anchor option is wanted.
