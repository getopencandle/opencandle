---
id: seasonality
name: Seasonality
kind: indicator
family: statistics
sources:
  - title: ChartSchool, Seasonality Charts
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-types/seasonality-charts
    type: secondary
  - title: Stock Trader's Almanac (six-month seasonal pattern, cited by ChartSchool)
    author: Yale Hirsch
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
Shows how a symbol has tended to behave in each calendar month across many years: how often the month closed higher and the average gain or loss.

## How the author meant it to be used
Seasonality is the tendency to do better or worse in particular periods (ChartSchool, citing Yale Hirsch's six-month pattern). Common reading: more than 50 percent positive suggests a bullish bias and less than 50 percent a bearish one, but readings beyond roughly 65 percent or below 35 percent are the meaningful ones, and months between 40 and 60 percent show no strong bias. Average gain also matters: a month can be up more often than down yet still lose on average. ChartSchool's tool also supports relative seasonality against a second symbol. It stresses that this is a historical tendency with no guarantee.

## How you interact with it
Automatic, chart-only study in a separate pane (a monthly heatmap, a monthly price projection, and a summary table). You choose the year range, excluded months, calendar and date-label conventions, colors and summary toggles. Nothing is placed or anchored. It needs the chart's original daily or monthly history, and shows nothing without it; it cannot be driven by alerts. The current month is incomplete and is flagged or treated separately.

## Calculation
ChartSchool: for each calendar month, count the years in which it closed higher (percent positive) and average the monthly gain or loss; example: nine up months in 19 years is 47 percent. OpenCandle computes monthly returns from consecutive month closes, population deviation, with zero counted as not positive. A first supplied month without its preceding close stays unavailable. It exposes four values: expected price for the current month, the historical average percent, the historical deviation percent, and the number of months used.

## Standard defaults
ChartSchool uses about 20 years of history. OpenCandle's start and end years, calendar and colors are its own choices.

## Reading it
Look for months with strong, consistent bias and a supportive average. Treat as context beside trend and price levels, not a signal.

## Common mistakes and edge cases
- Including the unfinished current month as a full sample.
- Mixing calendar-month and trading-month boundaries, or session definitions.
- Survivorship: short histories give few samples per month.
- Provider daily coverage limits and listing dates.

## How OpenCandle does it
- A month counts as positive only when its return is above zero. Returns come from consecutive month closes, with population deviation.
- The developing month is left out of summaries by default (a toggle includes it). Projections are fixed at the month's open using only returns available by then.
- Needs the chart's original daily or monthly history. Alerts cannot use it.

## Open questions
OpenCandle's heatmap and projection boxes are its own presentation; the percent-positive and average-gain math follows ChartSchool.
