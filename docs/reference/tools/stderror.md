---
id: stderror
name: Standard error
kind: indicator
family: statistics
sources:
  - title: Standard error bands, Technical Analysis of Stocks and Commodities
    author: Jon Andersen
    year: 1996
    url: book
    type: primary
  - title: Standard error of the regression estimate (general statistics)
    author: common statistical definition
    year: n/a
    url: book
    type: secondary
confidence: medium
---

## Purpose
Measures how tightly recent prices cluster around their least-squares trend line. Small values mean a clean linear trend; large values a noisy or curved one.

## How the author meant it to be used
No single technical author owns the stand-alone line. It is the regression standard error that Andersen used to size his bands (see Standard error bands) and that other regression tools use. Read it as a trend-quality gauge: low and steady means a reliable straight-line trend; a spike means price left the line.

## How you interact with it
Automatic, in its own pane. Set length and source. Nothing is placed; each value reads the current and earlier bars only.

## Calculation
Fit y = a + b x to the last N values against x = 0..N-1 by least squares. Standard error = sqrt( sum of squared residuals / (N - 2)). The N - 2 divisor reflects two fitted parameters, which is why the minimum length is 3. A perfectly straight window gives 0.

## Standard defaults
OpenCandle uses 14 and close. This is a tool convention, not from an original author.

## Reading it
Values are in price units, so judge them relative to price. Standard deviation measures spread around the mean; standard error measures spread around the trend, so in a strong trend it is much smaller.

## Common mistakes and edge cases
- Dividing by N or N-1 instead of N-2.
- Measuring residuals around the mean rather than the fitted line.
- Confusing it with the standard error of the mean (sd / sqrt(N)), a different quantity.
- A missing value in the window makes it unavailable.

## How OpenCandle does it
- Residuals are measured around the least-squares line and divided by N - 2. The minimum length is 3.
- Default length is 14 on the close.

## Open questions
Whether other tools use exactly the N-2 divisor was not verified; it is the conventional regression definition.
