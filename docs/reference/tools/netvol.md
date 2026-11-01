---
id: netvol
name: Net volume
kind: indicator
family: volume
sources:
  - title: ChartSchool, On Balance Volume
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/on-balance-volume-obv
    type: secondary
confidence: low
---

## Purpose
Per-bar up volume minus down volume: positive when buyers dominate the bar, negative when sellers do. Unlike On Balance Volume it is not cumulative.

## How the author meant it to be used
No single author found. The term net volume (up volume minus down volume) is used for the difference between volume traded on upticks and on downticks, or, in the bar-level form, between volume on up bars and down bars. True net volume needs intrabar (tick) data; with only bars, charting software classifies the whole bar by the close versus the prior close. That bar-level form is what OpenCandle does, and it is the same classification Granville used for OBV (per ChartSchool), just without the running total.

## How you interact with it
Automatic, no inputs. Needs volume data. Each value depends only on the current and previous close, known at the bar's close; no repaint after the bar finishes (the live bar changes while it forms).

## Calculation
net(t) = +volume(t) if close(t) > close(t-1); -volume(t) if close(t) < close(t-1); 0 if equal. The first bar has no prior close and is empty.

## Standard defaults
None.

## Reading it
Histogram or line around zero: sustained positive bars show buying pressure; spikes mark heavy volume days. Often summed or averaged by you for a trend view.

## Common mistakes and edge cases
- Making it cumulative (that is OBV).
- Counting an unchanged close as up or down; it should add zero.
- Comparing close to the same bar's open instead of the prior close gives a different, also-used, variant; state which.
- Missing volume makes the bar unavailable.

## How OpenCandle does it
- Classifies the whole bar by its close versus the previous close, not close versus open. An unchanged close counts as zero.
- The first bar has no previous close and is empty.

## Open questions
OpenCandle classifies by close versus prior close; no author settles whether close versus open is better.
