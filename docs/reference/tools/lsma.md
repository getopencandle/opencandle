---
id: lsma
name: Least squares moving average
kind: indicator
family: moving average (regression)
sources:
  - title: Linear regression (TA-Lib LINEARREG, ta_LINEARREG.c)
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_LINEARREG.c
    type: secondary
confidence: low
---

## Purpose
Plots, for each bar, the end point of the least-squares line fitted to the last n prices.

## How the author meant it to be used
No single author; it is the "linear regression value" or "time series forecast" end-point, popularised as the LSMA. Because it ends on the fitted line, it lags less than an SMA of the same length. Practitioners use it like a moving average: price crossing it, or its slope, shows trend. The optional offset looks back when positive (the value of the fitted line that many bars earlier) and forward when negative.

## How you interact with it
Automatic overlay. Inputs: length, regression offset, source. Known at bar close; each bar's value is a fresh fit, so past values never change.

## Calculation
Fit y = b + m x over the last n bars (x = 0 oldest to n - 1 newest). Value = b + m x (n - 1 - offset), so a positive offset looks back. TA-Lib's LINEARREG returns b + m x (period - 1). With offset 0 this equals the end point of the fitted line.

## Standard defaults
OpenCandle uses 25 and offset 0. Common use also 14 to 25; there is no author-set default.

## Reading it
Rising line = uptrend; price above = bullish. Over-reaction at sharp turns because the fit extrapolates.

## Common mistakes and edge cases
- Confusing the end-point value with the slope or with the regression channel centre line (which is the same at the newest bar).
- Offset sign and meaning differ between platforms.
- Do not re-fit and move older points.

## How OpenCandle does it
- A positive offset evaluates the fitted line that many bars further back; it does not project forward. A negative offset looks forward.
- Default length is 25, offset 0.

## Open questions
Platforms differ on whether the offset shifts the evaluation point or the plotted bar.
