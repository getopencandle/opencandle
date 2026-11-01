---
id: alma
name: Arnaud Legoux moving average
kind: indicator
family: moving average
sources:
  - title: Arnaud Legoux Moving Average (ALMA), Arnaud Legoux Consulting
    author: Arnaud Legoux and Dimitrios Kouzis-Loukas
    year: 2009
    url: book
    type: primary
  - title: Library and broker descriptions of ALMA
    author: various
    year: n/a
    url: n/a
    type: secondary
confidence: medium
---

## Purpose
A moving average whose weights follow a Gaussian curve placed near the recent end of the window, giving a smooth line with less lag than a simple average of the same length.

## How the author meant it to be used
Legoux and Kouzis-Loukas (2009) describe a Gaussian-weighted average whose peak can be moved toward the newest bar (the offset) and whose width is set by sigma. A high offset (near 1) means less lag but more noise; a low offset means more smoothing. Used like any moving average: trend direction, crossovers with price or another ALMA.

## How you interact with it
Automatic. Inputs: window size, offset, sigma, source. The value is final at the bar's close and does not repaint.

## Calculation
m = offset x (window - 1); s = window / sigma; weight_i = exp(-(i - m)^2 / (2 s^2)) for i = 0 .. window - 1, where i = window - 1 is the newest bar; ALMA = sum(weight_i x price_i) / sum(weight_i). One source indexes i = 0 as the newest bar, which would mirror the offset; the other sources and the usual convention put the peak toward the newest bar.

## Standard defaults
Window 9, offset 0.85, sigma 6 (stated as the author defaults by published summaries).

## Reading it
Price above a rising ALMA is bullish. Larger sigma gives a narrower weight peak and a more responsive but noisier line (wide-vs-narrow wording varies between descriptions).

## Common mistakes and edge cases
- Indexing the weights from the wrong end, so the peak lands on old data.
- Not normalising by the sum of the weights.
- Using a rounded m: the formula uses the real number.
- Sigma of zero or negative must be rejected.

## How OpenCandle does it
- The weights peak toward the newest bar, the peak position (offset x (window - 1)) is not rounded, the width is window / sigma, and the result is divided by the sum of the weights.
- Defaults are window 9, offset 0.85 and sigma 6.

## Open questions
Whether larger sigma narrows or widens the weight peak depends on the formula form (s = window / sigma narrows with sigma, as above). Check against the author's page.
