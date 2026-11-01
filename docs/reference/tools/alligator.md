---
id: alligator
name: Williams alligator
kind: indicator
family: trend
sources:
  - title: Trading Chaos
    author: Bill Williams
    year: 1995
    url: book
    type: primary
  - title: ChartSchool, Alligator
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/alligator
    type: secondary
confidence: medium
---

## Purpose
Three forward-shifted smoothed moving averages (jaw, teeth, lips) whose spacing shows whether the market is trending ("hungry"), starting to trend ("awakening") or ranging ("sleeping").

## How the author meant it to be used
Bill Williams introduced it in Trading Chaos (1995); The premise (ChartSchool) is that markets trend only about 15 to 30 percent of the time, so the tool exists to say when a trend is waking up. Sleeping: the three lines are intertwined or close together; avoid trading. Awakening: the lips cross the teeth and jaw, and the direction of the cross suggests the trend direction. Hungry: the lines separate and fan out; ride the trend until they converge again. ChartSchool pairs it with fractals: in a bullish awakening, wait for a bullish fractal then a break above its high; exit as the lines converge, with a stop below the latest bearish fractal. The jaw, teeth, lips order (jaw slowest) is part of the design.

## How you interact with it
Automatic. Inputs: length and forward offset for each of jaw, teeth and lips. No placement. Because the lines are shifted forward, the value shown at a bar is the average computed several bars earlier; the newest computed values are drawn past the last loaded bar, in the empty space to the right. These projected values are not forecasts; they are the already-known values of the earlier average. They are final only after the bar that produced them closes, and the latest ones move while that bar forms.

## Calculation
SMMA (Wilder-style smoothed moving average) of the median price (high + low) / 2. Jaw: 13 periods, shifted forward 8 bars. Teeth: 8 periods, shifted 5. Lips: 5 periods, shifted 3. ChartSchool states these exactly. SMMA is the Wilder average: new = (prior x (n - 1) + price) / n, seeded by a simple average of the first n values (the seeding is an implementation detail; OpenCandle seeds with a simple average of the first n values). The first drawn value occurs after length plus offset bars. In OpenCandle each line is shifted inside the calculation so the value at a bar is the value displayed there.

## Standard defaults
13/8, 8/5, 5/3 (length/offset). Colours in ChartSchool: jaw blue, teeth red, lips green; OpenCandle uses the same.

## Reading it
Tangled lines: no trend. Lips above teeth above jaw fanning out: up trend. Reverse order: down trend. Convergence: trend ending.

## Common mistakes and edge cases
- Shifting backward instead of forward.
- Using close instead of median price.
- Using EMA instead of SMMA.
- Reading the projected right-edge values as predictions.
- Using it in sideways markets; it is built to say when not to trade.

## How OpenCandle does it
- Uses the SMMA seeded with a simple average, on the median price (high + low) / 2.
- Each line is shifted forward inside the calculation. The newest shifted values are drawn past the last loaded bar for display only; they are earlier averages, not forecasts.
- Lengths and shifts are 13/8, 8/5 and 5/3, as Williams gave them.

## Open questions
The SMMA seeding rule and whether Williams' original used median price in all platforms were not verified from the book.
