---
id: efi
name: Elder force index
kind: indicator
family: volume
sources:
  - title: Trading for a Living
    author: Alexander Elder
    year: 1993
    url: book
    type: primary
  - title: ChartSchool, Force Index
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/force-index
    type: secondary
confidence: high
---

## Purpose
Combines direction, extent and volume of a price move into one oscillator that measures the power behind it.

## How the author meant it to be used
ChartSchool, citing Elder's Trading for a Living: the three elements of a move are direction, extent and volume. The 1-period Force Index is (close - prior close) x volume; it is jagged, so Elder recommends smoothing it with a 13-period EMA. A rising 13-day Force Index above zero confirms an uptrend; negative readings in an uptrend can show playable corrections; divergences foreshadow reversals. A short-term (2-period) version is used for entry timing within a longer trend.

## How you interact with it
Automatic. Input: length (EMA length of the 1-period series). Value known at bar close; first bar has no prior close.

## Calculation
FI(1) = (close - prior close) x volume. FI(N) = EMA(FI(1), N). Units are price times volume, so the scale depends on the symbol.

## Standard defaults
13 (Elder). A length of 1 shows the raw series.

## Reading it
Sign shows who is in control. Size reflects both the move and the volume behind it, so a large positive value on heavy volume shows strong commitment from buyers. Compare only within one symbol.

## Common mistakes and edge cases
- Using SMA instead of EMA smoothing.
- Using the high-low range instead of the close change.
- Gaps: the close-to-close change includes the gap.
- Zero volume bars give zero.

## How OpenCandle does it
- Smooths the one-bar force with an EMA seeded by a simple average. Default length is 13 (Elder).

## Open questions
Elder's exact wording of the 2-period short-term rule is not reproduced.
