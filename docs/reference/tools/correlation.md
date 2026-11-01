---
id: correlation
name: Correlation coefficient
kind: indicator
family: statistics
sources:
  - title: ChartSchool, Correlation Coefficient
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/correlation-coefficient
    type: secondary
  - title: Pearson product-moment correlation (standard statistics)
    author: Karl Pearson
    year: 1895
    url: book
    type: primary
confidence: medium
---

## Purpose
Measures how closely two securities move together over a rolling window, from -1 (opposite) to +1 (together).

## How the author meant it to be used
No technical-analysis author; the statistic is Pearson's. ChartSchool presents it for intermarket, sector versus stock and sector versus market analysis, and for diversification by finding securities with low or negative correlation to the market. It is not a momentum oscillator: it moves between periods of positive and negative correlation. Anything above 0.50 shows a strong positive correlation; readings between 0 and -1 mean opposite movement.

## How you interact with it
Automatic once you pick the second symbol (OpenCandle default SPY). Inputs: second symbol, source, length. Value known at bar close.

## Calculation
Pearson correlation of the two price series (source and the second symbol's close) over the last N bars: covariance divided by the product of the standard deviations. ChartSchool's example uses means of the prices, squares and cross-products to get variance and covariance, with a 20-day window (INTC against QQQ gave +0.95).

## Standard defaults
Length 20 (the ChartSchool example window).

## Reading it
+1 perfect positive, 0 none, -1 perfect negative; both perfect cases are rare. Correlation varies over time.

## Common mistakes and edge cases
- Correlating price levels rather than returns overstates relationships between trending series (the log-return tool covers this).
- Misaligned bars between the two symbols.
- Flat window (zero variance) is undefined.
- Short windows are noisy.

## How OpenCandle does it
- Correlates price levels, not returns, matching the original description. For a trend-free reading use Correlation (log returns).
- Bars are matched by exact time; a bar where only one symbol traded is skipped, never filled.
- Default second symbol is SPY and default length is 20.

## Open questions
None specific to the formula. Handling of bars where only one symbol traded is implementation-specific.
