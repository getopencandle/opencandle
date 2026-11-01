---
id: mahamming
name: Moving average Hamming
kind: indicator
family: moving averages
sources:
  - title: Digital Filters (Hamming window)
    author: Richard W. Hamming
    year: 1977
    url: book
    type: primary
  - title: Hamming window (general signal-processing convention)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: medium
---

## Purpose
A weighted moving average whose weights come from the Hamming window, so the middle of the window counts most and the oldest and newest bars count least.

## How the author meant it to be used
Hamming's window was designed for spectral and filter design, not trading: a raised-cosine taper that reduces side-lobe leakage. Charting use is a borrowed smoothing filter with no trading author or rule set. The window is symmetric, which is the key point: unlike a linear weighted average, the newest bar does not get the heaviest weight, so it lags more than a same-length LWMA but is smoother.

## How you interact with it
Automatic. You set the length and the source series. Nothing placed. Each value uses only the last N bars, so it never repaints.

## Calculation
Weights w(k) = 0.54 - 0.46 cos(2 pi k / (N - 1)) for k = 0..N-1, k = 0 the oldest bar. Average = sum(w(k) x price(k)) / sum(w(k)). End weights are 0.08. Some variants use N instead of N - 1 in the denominator (the periodic window); the symmetric N - 1 form is the classic filter-design one. 0.54 and 0.46 are the usual Hamming constants (the exact 25/46 and 21/46 pair also exists).

## Standard defaults
No author default. OpenCandle uses length 10, source close.

## Reading it
Read like any moving average: direction, price crossing it, slope. Its effective delay is about half the window, similar to an SMA.

## Common mistakes and edge cases
- Putting the largest weight on the newest bar (that is a different filter).
- Using the periodic denominator by accident.
- Length 1 divides by zero in the cosine; a minimum of 2 is needed (length 2 gives equal weights).
- A missing value in the window makes the output unavailable.

## How OpenCandle does it
- Uses the symmetric Hamming window (the classic filter form, with N - 1 in the denominator), not the periodic one.
- Default length is 10 on the close. The minimum length is 2.

## Open questions
Symmetric versus periodic window form is not fixed by any charting author. OpenCandle uses the symmetric form.
