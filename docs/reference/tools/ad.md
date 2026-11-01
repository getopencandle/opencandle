---
id: ad
name: Accumulation/distribution
kind: indicator
family: volume
sources:
  - title: ChartSchool, Accumulation Distribution Line
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/accumulation-distribution-line
    type: secondary
  - title: TA-Lib AD source, ta_AD.c
    author: TA-Lib project
    year: n/a
    url: https://raw.githubusercontent.com/TA-Lib/ta-lib/main/src/ta_func/ta_AD.c
    type: secondary
  - title: Marc Chaikin's Cumulative Money Flow Line
    author: Marc Chaikin
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
A running total of volume weighted by where each bar closed within its range, to show whether volume is flowing into (accumulation) or out of (distribution) a security.

## How the author meant it to be used
ChartSchool credits Marc Chaikin, who originally called it the Cumulative Money Flow Line. It is used to confirm a price trend (both rising or falling together) and to flag divergences: price makes a new low while the line does not (bullish), or price makes a new high while the line does not (bearish), on the theory that volume precedes price. ChartSchool also stresses it ignores the change from one bar to the next, only the close's position in the range, so it can disagree with On Balance Volume and with price.

## How you interact with it
Automatic, no inputs. Needs volume. The value on each bar is known at its close. It is a cumulative total, so the absolute level depends on where the data starts; only the shape and slope matter.

## Calculation
Money Flow Multiplier = ((Close - Low) - (High - Close)) / (High - Low). Money Flow Volume = multiplier x volume. ADL = previous ADL + Money Flow Volume. TA-Lib starts at 0 and adds nothing for a bar whose High - Low is not positive.

## Standard defaults
None. No parameters.

## Reading it
Rising line confirms an uptrend; falling confirms a downtrend; a line that diverges from price warns of a possible reversal. ChartSchool cautions that the indicator is two steps removed from price, so divergences are not always followed by reversals.

## Common mistakes and edge cases
- Dividing by zero on a zero-range bar; skip the addition (TA-Lib) rather than error.
- Comparing absolute levels between charts that start at different dates.
- Using the close-to-close change like OBV, which is a different indicator.
- Zero volume contributes zero. A bar with missing volume has no value and the total carries on from the previous bar.

## How OpenCandle does it
- The running total starts at 0 on the first loaded bar, so the absolute level depends on where your data starts.
- A bar whose high equals its low adds 0.
- A bar with a missing price or volume shows no value and leaves the running total unchanged.

## Open questions
How OpenCandle handles missing volume on a bar (carry forward vs gap) is not stated in the sources.
