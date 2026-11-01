---
id: volzt
name: Volatility zero trend close-to-close
kind: indicator
family: volatility
sources:
  - title: Volatility (finance), annualisation of log-return deviation
    author: Wikipedia contributors
    year: n/a
    url: https://en.wikipedia.org/wiki/Volatility_(finance)
    type: secondary
confidence: low
---

## Purpose
Close-to-close volatility that assumes the average return is zero, so drift is not subtracted. It measures the root-mean-square of log returns instead of their deviation around the mean.

## How the author meant it to be used
No single author; the zero-mean (zero-trend) form is a standard variant of the historical estimator, often used on short windows where the sample mean is itself noisy. Wikipedia's volatility article mentions realised volatility as the square root of the sum of squared returns divided by the number of observations, which is the same zero-mean idea. It reads like ordinary close-to-close volatility, and the two differ most when the window has a strong trend.

## How you interact with it
Automatic. Inputs: Length, Annualization (Auto or Manual) and Annual (periods per year, used when Manual). No placement. Known at each bar's close, using only that bar and earlier. The live bar's value changes until close.

## Calculation
r_t = ln(close_t / close_(t-1)). Volatility = 100 x sqrt(mean of r_t squared over n returns) x sqrt(Annual). No subtraction of a mean and a divisor of n, not n - 1. First value after n + 1 bars. A missing or non-positive close makes the window unavailable.

## Standard defaults
Length 10, Annualization Auto (Manual uses 252).

## Reading it
Same as close-to-close volatility. In a strong trend it reads higher than the standard version because drift counts as variation.

## Common mistakes and edge cases
- Using the sample standard deviation (that is the other indicator).
- Dividing by n - 1 here.
- Using Manual annualization with a number that does not match the bar interval.
- Mixed percent and fraction scales.

## How OpenCandle does it
- Zero-mean form: the root of the mean of squared log returns, with a divisor of n, not n - 1. The first value comes after n + 1 bars.
- Annualization is Auto by default: 252 periods a year on daily US stock charts, 52 on weekly and 12 on monthly, and 252 times the regular-session bars in a day on intraday charts (for example 252 x 78 on 5-minute bars). Markets that trade around the clock, such as crypto, use 365 a day and 365 times the bars in 24 hours intraday. Choose Manual to type your own number. Charts saved before Auto existed keep their stored number.

## Open questions
What exact formula the reference tool uses for zero trend is not documented; the zero-mean root mean square is the common reading but unconfirmed for the reference.
