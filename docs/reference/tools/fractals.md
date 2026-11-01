---
id: fractals
name: Williams fractals
kind: indicator
family: swing / structure
sources:
  - title: Trading Chaos
    author: Bill Williams
    year: 1995
    url: book
    type: primary
  - title: ChartSchool, Alligator (fractal section)
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/alligator
    type: secondary
confidence: medium
---

## Purpose
Marks local swing highs and swing lows using a five-bar pattern: a bar whose high is above the highs of the two bars on each side (up fractal), or whose low is below the lows of the two bars on each side (down fractal).

## How the author meant it to be used
Bill Williams uses fractals in Trading Chaos (1995) as short-term support and resistance and as entry or stop references alongside the Alligator. ChartSchool describes them as five-bar patterns marked with an arrow above or below the centre bar and pairs them with the Alligator: in a bullish awakening, take the latest bullish fractal and enter on a break above its highest high; use the lowest low of the most recent bearish fractal as a stop. A fractal is a historical swing, not a forecast.

## How you interact with it
Automatic. One input: Periods (bars on each side, default 2). No placement. A fractal is plotted on its own centre bar at its high or low, but it is confirmed only after the next Periods bars have closed, so it appears with a delay of Periods bars and the newest Periods bars can never show one. Once confirmed it does not move or disappear (no repainting after confirmation).

## Calculation
Up fractal at bar i: high[i] is greater than high[i-k] and high[i+k] for k = 1..Periods. Down fractal: low[i] is lower than low[i-k] and low[i+k] for all k. OpenCandle uses strict comparisons, so an equal neighbour cancels the fractal. ChartSchool describes a bullish fractal as a centre bar with "the lowest low of the five" and a bearish one as the highest high. Some implementations allow equal highs on one side; sources differ on Williams' original rule.

## Standard defaults
Periods 2 (five-bar pattern; Williams and ChartSchool). The cross marker style and colours are OpenCandle's.

## Reading it
Last up fractal marks nearby resistance, last down fractal nearby support. A break of a fractal level is a structure break.

## Common mistakes and edge cases
- Drawing a fractal on the latest bars before confirmation (look-ahead).
- Placing the marker on the confirming bar rather than the centre bar.
- Treating equal highs as a fractal in a strict implementation.
- Both an up and a down fractal can occur on one bar (outside bar).
- At the start of data the first Periods bars cannot be fractals.

## How OpenCandle does it
- Comparisons are strict on both sides, so an equal neighbour cancels the fractal. Some platforms allow equal highs on the left.
- Shown with a delay of Periods bars on the centre bar, and never repainted.

## Open questions
Handling of equal highs or lows (strict vs non-strict) in Williams' original is unclear.
