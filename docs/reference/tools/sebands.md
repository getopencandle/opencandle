---
id: sebands
name: Standard error bands
kind: indicator
family: bands
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
confidence: low
---

## Purpose
An envelope around a linear regression end point, sized by the standard error of the regression, meant to follow trends more closely than Bollinger Bands.

## How the author meant it to be used
Jon Andersen (S&C, 1996) built bands from the n-period linear regression value plus and minus k standard errors, each line smoothed with a short simple average. Because the centre follows the trend line and the width measures scatter around that line (not around a flat mean), the bands hug trending markets. Touches of the outer bands are read as stretched price; context decides whether that means exhaustion or strength.

## How you interact with it
Automatic overlay. Set length (21), smoothing (3), number of standard errors (2) and source. Nothing is placed. Values use current and earlier bars only. The first value needs length + smoothing - 1 bars.

## Calculation
For each bar: least-squares fit over the last n values; end = line value at the newest bar; SE = sqrt(sum of squared residuals / (n - 2)). Raw upper = end + k x SE and raw lower = end - k x SE. Middle, upper and lower are each smoothed by an s-period SMA.

## Standard defaults
n 21, smoothing 3, k 2, source close (Andersen's values as commonly given).

## Reading it
Bands widen when price scatters from its trend and narrow in clean trends. Price riding the upper band in an uptrend is strength; a return to the middle line is a pullback.

## Common mistakes and edge cases
- Using standard deviation instead of standard error (the bands become Bollinger-like).
- Forgetting the SMA smoothing of all three lines.
- Using the regression line's midpoint instead of its end value as the centre.

## How OpenCandle does it
- Each band is the regression end value plus or minus k standard errors (residuals divided by n - 2), and all three lines are then smoothed with a short SMA.
- Defaults are length 21, smoothing 3, 2 standard errors on the close. The first value needs length + smoothing - 1 bars.

## Open questions

