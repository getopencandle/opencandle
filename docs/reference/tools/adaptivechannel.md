---
id: adaptivechannel
name: Adaptive trend channel
kind: indicator
family: trend
sources:
  - title: ChartSchool, Raff Regression Channel
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/raff-regression-channel
    type: secondary
  - title: Technical Analysis of the Financial Markets, trendlines and channels
    author: John J. Murphy
    year: 1999
    url: book
    type: secondary
confidence: low
---

## Purpose
Draws a trend channel around a regression line whose look-back length is chosen automatically to fit the recent trend.

## How the author meant it to be used
There is no single author of "adaptive" length selection. The Raff Regression Channel, per ChartSchool, is a linear regression (least squares line of best fit on closing prices) with evenly spaced trend lines above and below. Its width is set by the high or low that is furthest from the regression line, with the other line the same distance on the opposite side. The uptrend span runs from the lowest closing low to the highest closing high of the move (mirror for a downtrend). Closes drive the regression, while intraday highs and lows set the width. The trend is up while prices rise within the channel, and an uptrend reverses when price breaks below the channel extension. ChartSchool warns that spike highs or lows make very wide channels, and that sharp initial moves leave few touches on the outer lines. Standard-deviation or standard-error channels are a different family; they are an analogy with Bollinger bands, not Raff's method. Choosing the length by trying several and keeping the best fit (for example highest correlation) is common practice with no published rule.

## How you interact with it
Automatic. You can set the set of candidate lengths, the width multiplier and the source. Nothing is placed. Because the length is re-chosen, the channel is expected to change as bars arrive; this is a feature of the tool, not a fault, and the current length should be visible.

## Calculation
For each candidate length L ending at the latest bar: least squares line of close on bar index; correlation or R squared as the fit score; pick the best-scoring L (ties and a minimum score are tool choices). Channel width options: Raff style = maximum deviation of highs and lows from the regression line (ChartSchool), or k times the standard deviation of residuals (an alternative). OpenCandle uses the second option. Lines extend from the span start to the latest bar and optionally forward. Values for past bars are not final: they can be recomputed when the chosen length changes, so the channel repaints by design.

## Standard defaults
None authoritative. Common: width 2 standard deviations in the residual version, candidate lengths from about 20 to a few hundred bars (common practice, not a published rule).

## Reading it
ChartSchool reads a break of the channel extension against the trend as a reversal signal, and the channel as a trend identification tool. A change in chosen length may itself indicate a regime change (unsupported opinion).

## Common mistakes and edge cases
- Using log versus linear price inconsistently (long spans on volatile assets).
- Choosing length on in-sample fit, which favours overfitting.
- Treating the historical channel as what was known at the time (look-ahead).
- Too few bars at the start of data.
- Time axis with gaps (weekends) treated as index steps.
- Calling a residual-standard-deviation channel a Raff channel.

## How OpenCandle does it
- The line is fitted to the natural log of the close, so long spans on volatile instruments stay balanced. This is not Raff's method, and the tool is not called a Raff channel.
- Candidate lengths are tried and the one with the largest absolute Pearson correlation wins; the shorter length wins a tie. The Short term tries 20 to 200 bars and the Long term 300 to 1200.
- Upper and lower lines sit the Deviation (default 2) times the standard deviation of the log residuals above and below the fit, using the population form (divide by the number of bars).
- The channel is refitted on every new bar, so its length and position change as bars arrive. A window with a missing or non-positive close is skipped, and with fewer bars than the shortest length nothing is drawn.

## Open questions
No source for the adaptive length selection. Raff's original text was not found. Whether OpenCandle uses residual standard deviation or maximum deviation, and its selection score, must be read from the implementation.
