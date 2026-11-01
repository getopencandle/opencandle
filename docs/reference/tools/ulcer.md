---
id: ulcer
name: Ulcer index
kind: indicator
family: volatility
sources:
  - title: Ulcer Index and UPI Measure Investment Risk and Risk-Adjusted Performance
    author: Peter G. Martin
    year: n/a
    url: https://www.tangotools.com/ui/ui.htm
    type: primary
  - title: The Investor's Guide to Fidelity Funds
    author: Peter Martin and Byron McCann
    year: 1989
    url: book
    type: primary
  - title: ChartSchool, Ulcer Index
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/ulcer-index
    type: secondary
confidence: high
---

## Purpose
A downside-only volatility measure: the root-mean-square of percentage drawdowns from the running peak. Only declines add to it, and long, deep drawdowns add most.

## How the author meant it to be used
Martin devised it in 1987 as an alternative to standard deviation, which counts upside moves as risk. He recommends it as the risk term in a risk-adjusted performance ratio, the Ulcer Performance Index (UPI, or Martin ratio): (return minus risk-free return) divided by the Ulcer index. He says it is stable across sampling intervals, calls weekly data robust and warns against intervals beyond a week (quarterly strongly discouraged). It was meant for comparing funds, not as a timing signal. ChartSchool agrees and calls it "not an indicator per se".

## How you interact with it
Automatic. Inputs: Length and Source. No placement. The value at a bar uses that bar and earlier ones only. The live bar's value changes until close.

## Calculation
Martin's algorithm, from his pseudo-code: start with a running maximum of 0 and a sum of 0. For each of the N values in order: if the value exceeds the maximum, the maximum becomes the value (and nothing is added); otherwise add (100 x (value / maximum - 1)) squared. Ulcer index = square root of (sum / N). So the peak is the highest value seen from the start of the N-period window up to that point, and N is the divisor including new-high bars (which count as zero).

ChartSchool describes a different, rolling form: for every bar, percent drawdown = (close - highest close of the last 14) / that highest close x 100; then the Ulcer index is the square root of the 14-bar average of those squared drawdowns. Here the peak at each bar is a trailing maximum, so for early bars of the window it can come from before the window. The two forms give different numbers. OpenCandle implements the ChartSchool rolling form (highest source over Length, then mean of squares over Length), so its first value appears at bar 2 x Length - 2.

## Standard defaults
14 periods (ChartSchool and OpenCandle). ChartSchool's fund examples use 9 weekly periods and a 52-period average of the index.

## Reading it
Zero when price rises every bar. It rises as price falls away from recent highs and stays up while recovery takes long. Compare readings only across the same Length and bar interval. ChartSchool treats a spike above 10 as notable for the funds it shows; that is an observation, not a rule.

## Common mistakes and edge cases
- Mixing the two forms (running peak within the window vs trailing rolling maximum).
- Using the standard deviation of drawdowns; Martin squares the drawdowns without subtracting a mean.
- Using high or low instead of the close (the original uses the value series, normally close).
- A zero or missing peak makes a bar unavailable.

## How OpenCandle does it
- Uses ChartSchool's rolling form (percent drawdown from the highest source value of the last Length bars, then the root of the mean of the squares), not Martin's own running-peak algorithm. The two give different numbers.
- The first value comes at bar 2 x Length - 1. Default length is 14 on the close.

## Open questions
OpenCandle uses ChartSchool's rolling form, not Martin's own algorithm.
