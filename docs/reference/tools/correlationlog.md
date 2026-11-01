---
id: correlationlog
name: Correlation - Log
kind: indicator
family: statistics
sources:
  - title: Pearson product-moment correlation applied to log returns (standard statistics; no single technical-analysis author)
    author: Karl Pearson (coefficient); no author for the log-return application
    year: 1895
    url: book
    type: primary
  - title: ChartSchool, Correlation Coefficient
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/correlation-coefficient
    type: secondary
confidence: medium
---

## Purpose
Shows how closely the chart symbol's returns move with a second symbol's returns, free of the trending-price bias that affects correlation of raw prices.

## How the author meant it to be used
No single technical-analysis author. The statistical idea is standard: correlate returns rather than price levels, because two trending price series can correlate strongly with no real relationship. ChartSchool describes the price-based Correlation Coefficient (separate tool) for intermarket, sector versus market and diversification analysis. The log version applies the same Pearson formula to log returns ln(x_t / x_(t-1)).

## How you interact with it
Automatic once a second symbol is chosen by you. Inputs: second symbol (OpenCandle default SPY), source, length. Value known at bar close; depends on both series being aligned bar for bar. A missing or non-positive value makes that bar's return unavailable.

## Calculation
Return a_t = ln(source_t / source_(t-1)) and b_t = ln(second close_t / second close_(t-1)). Correlation = covariance(a, b) / (sd(a) x sd(b)) over the last N returns. A window with an unavailable return on either side, or with zero variance (flat), is unavailable.

## Standard defaults
Length 20 (matches the Correlation coefficient tool; OpenCandle-defined default symbol SPY).

## Reading it
Between -1 and +1. Above about 0.5 is a strong positive relationship per ChartSchool's rule of thumb for the price version; near 0 means no linear relationship; negative values mean opposite moves. Correlation changes over time.

## Common mistakes and edge cases
- Comparing against the raw-price correlation, which reads higher in trends.
- Mismatched calendars (different trading days) make the alignment shift.
- Small windows are noisy: 20 bars gives wide confidence bands.
- Correlation is not causation and is not scale-sensitive.

## How OpenCandle does it
- Correlates log returns of the two series. A missing bar on either side is never bridged: the return across it is unavailable.
- A zero or negative price makes that return unavailable.
- Default second symbol is SPY and default length is 20.

## Open questions
Whether the other platforms' "Correlation - Log" uses sample or population standard deviation is irrelevant for Pearson (it cancels), but their alignment of missing bars is unknown.
