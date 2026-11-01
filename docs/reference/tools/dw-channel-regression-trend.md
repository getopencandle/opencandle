---
id: dw-channel-regression-trend
name: Regression trend
kind: drawing
family: channels
sources:
  - title: Raff Regression Channel (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/raff-regression-channel
    type: secondary
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: medium
---

## Purpose
A least-squares linear regression line fitted to prices between two chosen bars, with parallel bands above and below. You pick the range; line and bands are computed from the data in it. The Raff Regression Channel is the best-known form.

## How the author meant it to be used
Gilbert Raff developed the Raff Regression Channel (ChartSchool). Its middle line is the linear regression, the least-squares line of best fit, of closing prices across the move. The channel half-width is set by the high or low furthest from the regression line and the other band sits the same distance on the other side. An uptrend runs from the lowest closing low to the highest closing high, a downtrend the reverse. Closes are used for the fit, intraday highs and lows to set the width. An uptrend reverses when price breaks below the channel extension. Bands at plus and minus N standard deviations of the residuals are a different, later convention with no single source (general practice).

## How you draw it
Two clicks: the start bar and the end bar of the range. After that it is automatic: the fit is computed from the loaded bars in the range. Both ends are draggable and the body moves the range; each change recomputes the fit. It can extend to the right as an option. Because it depends on loaded data, it recomputes on interval change (the range maps to the nearest bars on the new interval, so the fit differs).

## Geometry and levels
For n bars with x = 0..n-1 and closes y: slope b = (n*Sum(xy) - Sum(x)*Sum(y)) / (n*Sum(x^2) - Sum(x)^2); intercept a = (Sum(y) - b*Sum(x)) / n; middle line a + b*x. Raff width = the largest distance of any high above, or low below, the line (ChartSchool: the furthest high or low). Upper = line + width, lower = line - width. Standard deviation variant: width = k * stdev(y - line), k commonly 2. The fit may be done in price or log price depending on scale mode; log is better over long ranges.

## Standard defaults
Raff: width from the furthest high or low. Standard deviation variants: k = 2 is common. OpenCandle uses 2 population standard deviations of the close residuals (sum of squared errors divided by n), with separate Upper deviation and Lower deviation inputs, both 2 by default. This is not the Raff maximum-deviation width. The fit is a least squares of close on bar index in raw price.

## Reading it
Price inside the channel confirms the trend; the middle line is the average path; touching the outer lines shows stretch, and ChartSchool notes moves beyond the extensions can indicate overbought or oversold. In Raff's usage a break of the extended channel against the trend is the reversal signal.

## Common mistakes and edge cases
- Using highs and lows for the regression itself instead of closes (Raff uses closes for the fit).
- Fit in linear price but displayed on log, giving a bent look.
- Fewer than 2 bars must be rejected.
- With a fixed range the channel only changes with interval change or data revision; if the end is tied to 'latest' it changes with every bar.
- Width from a maximum is sensitive to a single spike.

## How OpenCandle does it
- Least squares of the close on the bar index, in raw price. On a log chart the lines join the two end prices, so the midline is not a log-space fit.
- Upper deviation and Lower deviation are standard deviations (population, sum of squared errors divided by n) of the fit. Both default to 2.
- This is not the Raff maximum-deviation width.
- An alert that follows this drawing restarts when you change a deviation.
- The statistic is shown as Pearson's R.

## Open questions
- ChartSchool's Raff page is the source for the Raff channel; the standard deviation variant is unverified.
