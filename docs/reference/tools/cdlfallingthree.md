---
id: cdlfallingthree
name: Falling three methods (bearish)
kind: pattern
family: three methods
sources:
  - title: Japanese Candlestick Charting Techniques
    author: Steve Nison
    year: 1991 (2nd ed. 2001)
    url: book
    type: primary
  - title: Candlestick Pattern Dictionary (ChartSchool)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary
    type: secondary
  - title: Encyclopedia of Candlestick Charts
    author: Thomas N. Bulkowski
    year: 2008
    url: book
    type: secondary
confidence: medium
---

## Purpose
A five-bar bearish continuation pattern: a long black bar, a short pause of small bars inside its range, and a second long black bar that makes a new low.

## How the author meant it to be used
Nison treats falling three methods as a continuation pattern in a downtrend: a long black candle, then three small real bodies, usually white, that stay within the range of the first candle, then another long black candle closing at a new low. The small bodies mean the bounce could not seriously challenge the first bar; bears resume. ChartSchool's dictionary: three small body days each contained within the high-low range of the first day, with the fifth day closing at a new low. The Nison description is paraphrased from his book.

## How you interact with it
Fully automatic. There is nothing to place, anchor or drag. Add it from the Patterns tab of the Indicators dialog; the indicator scans every bar and puts a labelled marker on the bar that COMPLETES the pattern (the last bar of the formation), and sets its 0/1 signal plot to 1 on that bar. Inputs: 'Detect trend based on' (SMA50, 'SMA50, SMA200', or No detection) and, where the family has both directions, 'Pattern type' (Bullish, Bearish or Both). Trend rule SMA50: uptrend means the close is above its 50-bar average, downtrend below. 'SMA50, SMA200' additionally needs the 50 above (or below) the 200. No detection accepts every bar. The signal is known only when the completing bar has closed: on a live bar the marker can appear or vanish until the bar closes, but once the bar is closed it never moves or repaints, and no later bar is read. Nison and ChartSchool both say most candlestick patterns want follow-through (a gap, a long candle in the new direction, or heavy volume) within the next one to three bars; the indicator does NOT wait for that, it reports at completion, so confirmation is the reader's job. The trend context is read on the bar BEFORE the pattern's first bar, so the trend test never uses the pattern's own bars.

## Calculation
Five bars. Bar 1 black and long. Bars 2 to 4 have bodies no larger than the average body of the previous 14 bars and lie inside bar 1's range. Bar 5 black and long, closing below bar 1's close. Signal on bar 5. Trend gate (continuation role): a downtrend on the bar before bar 1.

## Standard defaults
OpenCandle's numeric thresholds (its own choice, not from the sources): doji body at most 5% of the bar's range; a small shadow at most 10% of the range; a 'long' body is larger than the mean body of the previous 14 bars and a 'small' body is at most half of that mean. Bars with a missing price or zero range never take part, and the first 14 bars cannot report patterns that need a long or small body. Nison gives no numeric thresholds; he describes shapes, so any percentage is an implementation choice.

## Reading it
A bearish continuation: the downtrend is expected to resume; the pause bars act like a flag. Failure is a close back above bar 1's high.

## Common mistakes and edge cases
- It is a continuation pattern, so it needs the prior downtrend.
- The pause bars need not be white in OpenCandle, only small and inside.
- Whether the pause bars must stay inside the first bar's full RANGE or only its BODY differs between references.

## How OpenCandle does it
- Exactly three inner bars. Each has a body no larger than the average body of the previous 14 bars and a high-low range wholly inside bar 1's range. Their colour does not matter.
- Bar 5 must be a long black bar closing below bar 1's close. TA-Lib also needs it to open below bar 4's close; OpenCandle does not.
- As a continuation pattern it needs a prior downtrend.
- Trend is judged on the bar before the pattern starts, using the close against its 50-bar average by default (or the 50 above the 200, or no trend test).
- The mark appears when the last bar closes. OpenCandle does not wait for follow-through, so confirmation is up to you.

## Open questions
- Sources differ on whether the pause bars must stay inside bar 1's body or only inside its full range; OpenCandle uses the range.
