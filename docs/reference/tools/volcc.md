---
id: volcc
name: Volatility close-to-close
kind: indicator
family: volatility
sources:
  - title: Volatility (finance), annualisation of log-return standard deviation
    author: Wikipedia contributors
    year: n/a
    url: https://en.wikipedia.org/wiki/Volatility_(finance)
    type: secondary
confidence: medium
---

## Purpose
Historical volatility from closing prices only: the annualised standard deviation of log returns over a rolling window, shown in percent.

## How the author meant it to be used
No single author; it is the textbook historical volatility estimator. Wikipedia's article gives the annualisation rule: daily standard deviation of log returns times the square root of the number of periods per year, with 252 trading days the usual assumption (its example: 0.01 x sqrt(252) = 15.87 percent). Used to size positions, compare instruments, or see when volatility is rising or falling. It says nothing about direction.

## How you interact with it
Automatic. Inputs: Length (bars), Annualization (Auto or Manual) and Annual (periods per year, used when Manual). No placement. A value at a bar uses that bar and earlier ones only; the live bar's value moves until close. Auto picks the periods per year from the chart interval and market; with Manual, match the number to the interval (periods per year, not days).

## Calculation
r_t = ln(close_t / close_(t-1)). Over the last n returns: s = sample standard deviation (divide by n - 1) around the window mean. Volatility = 100 x s x sqrt(Annual). The first value appears after n + 1 bars. A missing or non-positive close makes its return unavailable and any window holding one is unavailable. OpenCandle notes it equals its own Historical volatility indicator with identical inputs.

## Standard defaults
Length 10, Annualization Auto (Manual uses 252).

## Reading it
Higher means larger typical bar-to-bar moves. Compare against the same indicator's own history on the same interval. With 10 returns, the estimate is noisy.

## Common mistakes and edge cases
- Using simple returns instead of log returns (small differences) or dividing by n instead of n - 1.
- Using Manual annualization with a number that does not match the bar interval.
- Mixing percent and fraction scales.
- Gaps and overnight moves are included in close-to-close, unlike intrabar estimators.

## How OpenCandle does it
- Annualization is Auto by default: 252 periods a year on daily US stock charts, 52 on weekly and 12 on monthly, and 252 times the regular-session bars in a day on intraday charts (for example 252 x 78 on 5-minute bars). Markets that trade around the clock, such as crypto, use 365 a day and 365 times the bars in 24 hours intraday. Choose Manual to type your own number. Charts saved before Auto existed keep their stored number.
- Uses the sample standard deviation (n - 1) of log returns, and the first value comes after n + 1 bars.
- With the same inputs it gives the same line as Historical volatility.

## Open questions
Which standard-deviation divisor and mean treatment the original reference tool uses is not documented; OpenCandle uses sample deviation around the mean.
