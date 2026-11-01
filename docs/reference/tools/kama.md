---
id: kama
name: Kaufman adaptive moving average
kind: indicator
family: adaptive moving average
sources:
  - title: Smarter Trading
    author: Perry J. Kaufman
    year: 1995
    url: book
    type: primary
  - title: Kaufman's Adaptive Moving Average
    author: StockCharts ChartSchool
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/kaufmans-adaptive-moving-average-kama
    type: secondary
  - title: TA-Lib ta_KAMA.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_KAMA.c
    type: secondary
confidence: high
---

## Purpose
A moving average that follows price closely when movement is efficient (trending) and slowly when it is noisy.

## How the author meant it to be used
Kaufman designed it to adapt to market noise. ChartSchool: use it as a trend filter (rising KAMA means up) and for price crossovers; filter crossovers by time or percent to cut whipsaws. A longer KAMA (for example 10,5,30) can define the bigger trend while a faster one (10,2,30) gives entries. Do not raise the first parameter; lower it for more sensitivity.

## How you interact with it
Automatic overlay. Inputs: efficiency length, fast length, slow length, source. Known at bar close; recursive, so early values depend on the seed.

## Calculation
ER = |close - close[n]| / sum over n of |close - prior close|. SC = (ER x (2/(fast+1) - 2/(slow+1)) + 2/(slow+1))^2. KAMA = prior KAMA + SC x (price - prior KAMA). ChartSchool seeds the first KAMA with a simple average; TA-Lib seeds it with the prior close at the start bar. TA-Lib clamps ER to 1 and sets ER = 1 when the window sum of changes is 0 (flat window).

## Standard defaults
10, 2, 30 (Kaufman, ChartSchool).

## Reading it
Direction and price crosses, with filters as above.

## Common mistakes and edge cases
- Flat window: TA-Lib uses ER = 1; OpenCandle uses ER = 0. This changes the following values (SC is 0.0041 at ER 0 but 0.44 at ER 1 for the defaults).
- Squaring SC is easy to forget.
- Seed differs by source; start values differ and converge slowly.

## How OpenCandle does it
- A flat window (no net change) gives an efficiency ratio of 0, so the line moves slowest. TA-Lib uses 1 there.
- The first value is the prior price at bar n, as in TA-Lib; ChartSchool seeds with a simple average, so early values differ.
- A missing price restarts the average.

## Open questions
Which flat-window rule matches Kaufman's book is not known; sources disagree (TA-Lib vs OpenCandle).
