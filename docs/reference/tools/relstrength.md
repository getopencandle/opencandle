---
id: relstrength
name: Relative strength vs benchmark
kind: indicator
family: comparative / relative
sources:
  - title: ChartSchool, Price Relative / Relative Strength
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/price-relative-relative-strength
    type: secondary
confidence: high
---

## Purpose
Comparative relative strength: the chart symbol divided by a benchmark, with a moving average of that ratio to show its trend.

## How the author meant it to be used
This is the Price Relative, also called Relative Strength Comparative, not Wilder's RSI (a common confusion). ChartSchool: use it for stock selection, to find securities outperforming a benchmark or sector, and to find names that hold up in declines. Read the trend of the ratio (higher highs and higher lows, support or resistance breaks), a long moving average on it (a break below a 150-day SMA signals relative weakness), and divergences: the ratio rising while price falls shows relative strength in a decline.

## How you interact with it
Automatic. You choose the benchmark, source and the moving-average length. Nothing placed; the benchmark series is aligned to the chart bars. No repaint beyond the live bar.

## Calculation
RS(t) = source(t) / benchmark close(t). The moving average is the SMA of RS over the length. A zero benchmark close gives no value. Not rescaled (some tools rebase to 100 at a start date; that changes the level, not the shape).

## Standard defaults
No author default. OpenCandle: benchmark SPY, MA length 20, close. ChartSchool's example uses a 150-day SMA.

## Reading it
Ratio above its average and rising = leadership; below and falling = laggard. Compare shape, never the absolute level.

## Common mistakes and edge cases
- Confusing it with RSI (Wilder).
- Inverting the ratio.
- Misaligned dates and splits.
- Short MA lengths whipsaw.

## How OpenCandle does it
- Default benchmark is SPY, with a 20-bar moving average of the ratio on the close.
- The ratio is not rebased to 100. A zero benchmark close gives no value.

## Open questions
None beyond defaults.
