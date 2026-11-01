---
id: volohlc
name: Volatility O-H-L-C
kind: indicator
family: volatility
sources:
  - title: On the Estimation of Security Price Volatilities from Historical Data, Journal of Business 53(1)
    author: Mark B. Garman and Michael J. Klass
    year: 1980
    url: book
    type: primary
confidence: low
---

## Purpose
An annualised volatility estimate from each bar's open, high, low and close, which uses more information per bar than close-to-close and so needs fewer bars for a given accuracy.

## How the author meant it to be used
Garman and Klass (1980) proposed range-based estimators that use the open, high, low and close of each period, and showed them more efficient than the close-to-close method. The formula below is the standard Garman-Klass form. The estimator assumes no drift and no gaps between bars, so it understates volatility when there are overnight gaps. Tools that offer an O-H-L-C volatility often do not say which estimator they use; Garman-Klass is OpenCandle's own choice (Yang-Zhang was set aside because it needs the prior close and a weight).

## How you interact with it
Automatic. Inputs: Length, Annualization (Auto or Manual) and Annual (used when Manual). No placement. Known at each bar's close. The live bar's contribution changes as high, low and close change.

## Calculation
Per bar: 0.5 x ln(H/L) squared minus (2 ln 2 - 1) x ln(C/O) squared. Volatility = 100 x sqrt(mean of that quantity over n bars x Annual). Each bar is read alone, so overnight gaps are not counted. A missing or non-positive O, H, L or C makes the bar, and any window holding it, unavailable. First value at bar n.

## Standard defaults
Length 10, Annualization Auto (Manual uses 252).

## Reading it
Same as other volatility lines. It tends to read lower than close-to-close on gappy instruments. On a window with unusual bars the per-bar quantity can be negative in theory; the mean is expected positive.

## Common mistakes and edge cases
- Swapping in Parkinson (high-low only) or Rogers-Satchell, which are different formulas.
- Forgetting the 0.5 or the (2 ln 2 - 1) factor of about 0.386.
- Using the sample standard deviation instead of the root of the mean.
- Using Manual annualization with a number that does not match the bar interval.

## How OpenCandle does it
- Uses the Garman-Klass estimator. Each bar is read alone, so overnight gaps are not counted and the line reads low on gappy instruments.
- Annualization is Auto by default: 252 periods a year on daily US stock charts, 52 on weekly and 12 on monthly, and 252 times the regular-session bars in a day on intraday charts (for example 252 x 78 on 5-minute bars). Markets that trade around the clock, such as crypto, use 365 a day and 365 times the bars in 24 hours intraday. Choose Manual to type your own number. Charts saved before Auto existed keep their stored number.

## Open questions
Which estimator the original reference tool uses is unknown. The Garman-Klass formula was not checked against the paper.
