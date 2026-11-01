---
id: vortex
name: Vortex indicator
kind: indicator
family: trend
sources:
  - title: The Vortex Indicator, Technical Analysis of Stocks and Commodities 28(1), January 2010
    author: Etienne Botes and Douglas Siepman
    year: 2010
    url: book
    type: primary
  - title: ChartSchool, Vortex Indicator
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/vortex-indicator
    type: secondary
  - title: Vortex indicator
    author: Wikipedia contributors
    year: n/a
    url: https://en.wikipedia.org/wiki/Vortex_indicator
    type: secondary
confidence: high
---

## Purpose
Two lines, VI+ and VI-, that measure upward and downward trend movement relative to volatility. A crossing marks a possible new trend, and the gap between them shows trend strength.

## How the author meant it to be used
Botes and Siepman published it in the January 2010 issue of Technical Analysis of Stocks and Commodities, inspired by Viktor Schauberger's study of water flow and by Wilder's directional movement. Per the Wikipedia summary (which cites the article): the lines cross at a change of trend and diverge as it strengthens; VI+ crossing above VI- indicates a long, VI- crossing above VI+ a short; the article also suggested entering only at the extreme high or low of the crossing bar. ChartSchool adds that crossovers whipsaw and suggests thresholds: -VI falling below 0.90 and then +VI above 1.10 completes a bullish signal (mirror for bearish), and that waiting for a move above 1 after a cross can filter signals.

## How you interact with it
Automatic. One input: Length. No placement, nothing to drag. Values at a bar use that bar and the previous one for the movements and the previous Length bars for the sums. The cross is known at the close of the crossing bar and can undo itself on the live bar.

## Calculation
VM+ = |high - prior low|; VM- = |low - prior high|. True range = greatest of high - low, |high - prior close|, |low - prior close|. VI+ = sum of VM+ over n / sum of TR over n; VI- likewise. ChartSchool, Wikipedia and OpenCandle agree. Because movement and true range need the prior bar, the first value appears on bar n + 1. A zero true range sum is unavailable.

## Standard defaults
14 periods (OpenCandle and the article's examples); ChartSchool's examples use 26 weekly and 23 daily. Reference levels are 1.0, with 0.90 and 1.10 as optional thresholds.

## Reading it
Both lines oscillate around 1. VI+ above VI- means uptrend, the reverse downtrend. A narrow range around 1 with frequent crosses signals consolidation.

## Common mistakes and edge cases
- Using signed differences instead of absolute values for VM.
- Using ATR averages instead of sums (the ratio is the same only if both use the same window).
- Acting on a cross on the live bar.
- Short lengths produce many crosses.

## Open questions
None significant for the calculation. The article's entry rule (trade at the cross bar's extreme) is not implemented as a signal.
