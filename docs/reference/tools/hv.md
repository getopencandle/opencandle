---
id: hv
name: Historical volatility
kind: indicator
family: volatility
sources:
  - title: Options, Futures, and Other Derivatives
    author: John C. Hull
    year: 2022
    url: book
    type: secondary
confidence: medium
---

## Purpose
Measures how much price has varied recently, as an annualised percentage.

## How the author meant it to be used
No single inventor. The textbook estimate (Hull) is the sample standard deviation of continuously compounded returns ln(S_i / S_(i-1)) over n periods, scaled to a year by the square root of the number of periods per year (about 252 trading days). It describes the past and is used to size options, set stops or compare regimes.

## How you interact with it
Automatic, in its own pane. You set length and Annualization: Auto (the default for new instances) or Manual, where you set periods per year. Known at each bar close; no repainting.

## Calculation
r_t = ln(close_t / close_(t-1)). HV = 100 x sample standard deviation (divisor n - 1) of the last n returns x sqrt(periods per year). Auto picks the factor from the chart interval and market. US stocks: 252 on daily, 52 on weekly, 12 on monthly, and 252 x the regular-session bars of a day intraday (252 x 78 on 5-minute bars). 24/7 markets such as crypto: 365 a day and 365 x the bars of a 24-hour day intraday. Manual uses the number you enter. The population (divisor n) form is the other common variant.

## Standard defaults
OpenCandle uses length 10 and Auto annualisation (252 on daily US stock charts). Practitioners often use 20 or 30.

## Reading it
High values mean wide recent swings, not direction. Volatility tends to cluster and mean-revert.

## Common mistakes and edge cases
- Wrong annualisation factor for the interval (Manual 252 on a weekly chart reads about 2.2 times too high).
- Simple percent returns instead of log returns (close for small moves).
- Mixing n and n - 1.
- Nonpositive or missing closes make a return undefined.

## How OpenCandle does it
- Auto annualisation by chart interval and market (252, 52 or 12 periods for US stocks, 365 for 24/7 markets, and session bars for intraday). Choose Manual to type your own periods per year; charts saved before Auto keep their number.
- Uses the sample standard deviation (divisor n - 1) of log returns. Default length is 10.
- A missing or non-positive close makes that return unavailable.

## Open questions
Platforms differ on the divisor and on the intraday annualisation convention.
