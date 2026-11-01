---
id: lv-row-post
name: Post
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
A hosted social-post embed (a published message shown on the chart). It depends on an online publishing service.

## How the author meant it to be used
No single author; this is a general-purpose annotation feature found on most charting platforms. It is a convention, not a method with rules. The description reflects common practice.

## How you draw it
Not applicable offline: it needs an external service to fetch and display content. In OpenCandle it is marked unavailable because that service does not exist in OpenCandle.

## Geometry and levels
There is no chart geometry to specify. A local lookalike would be a Comment with an author and timestamp.

## Standard defaults
None.

## Reading it
It carries no signal. Its value is the reader's own commentary at a marked bar and price.

## Common mistakes and edge cases
- Do not fake social content locally.
- Embedding fetched remote content raises privacy and safety issues.

## Open questions
- Whether to implement it at all; it needs a service.
- Marked unavailable in OpenCandle.
