---
id: position
name: Long position
kind: drawing
family: position
also: [lvshortposition]
sources:
  - title: Trade Your Way to Financial Freedom
    author: Van K. Tharp
    year: 1998
    url: book
    type: primary
  - title: Risk/Reward Ratio
    author: Investopedia
    year: 2024
    url: https://www.investopedia.com/terms/r/riskrewardratio.asp
    type: secondary
  - title: Position sizing
    author: Investopedia
    year: 2024
    url: https://www.investopedia.com/terms/p/positionsizing.asp
    type: secondary
confidence: low
---

## Purpose
Visualises a planned trade with entry, stop loss and profit target on the chart, showing risk, reward and the reward-to-risk ratio so the idea can be judged before taking it.

## How the author meant it to be used
This is not a classical named method; it is a trade-planning aid based on risk management. Tharp expresses each trade in "R multiples": risk (entry minus stop) is 1R, and the target is some multiple of R. The reward-to-risk ratio equals (target - entry) / (entry - stop) for a long, and the mirrored form for a short. Position size follows from risk: units = account risk amount / |entry - stop|. Investopedia describes the same ratio; many traders look for at least 2:1. The tool is meant to be placed before trading, adjusted until the ratio is acceptable, and then used as a reference during the trade.

## How you draw it
OpenCandle: click the entry, then the target. A target above the entry makes a long, below makes a short (the short tool is the same shape mirrored: stop above, target below). The stop is placed on the opposite side of the entry from the target (by default the stop is half the target distance, a reward-to-risk of 2, measured on screen). Left edge of the box is the entry time; width is a time span (a number of bars at the current interval, stored as time); the horizontal sides are price levels. Entry, stop and target can be dragged, each independently, and the box can be moved as a whole. Price levels stay fixed; the horizontal extent should keep its time span across interval changes. On log scale, the displayed distances are distorted but the ratio uses price differences (plain subtraction); percent figures are calculated from prices.

## Geometry and levels
For a long: risk = entry - stop, reward = target - entry, ratio = reward / risk. For a short: risk = stop - entry, reward = entry - target. Percentages are relative to entry: (target - entry) / entry, (stop - entry) / entry. Quantity = account risk / risk per unit. Profit and loss in currency = price difference x quantity x point value. Long has target above entry and stop below; short is the inverse.

## Standard defaults
Account size, risk percent or lot size, leverage and point value are your settings; a common default ratio is 1:1 to 2:1 reward-to-risk. 

## Reading it
The ratio shows whether the trade pays for its risk: a low ratio needs a high win rate. Probability of hitting target versus stop is not part of the tool. Tharp's warning is that expectancy depends on the actual win rate and not only the planned R.

## Common mistakes and edge cases
- Stop on the wrong side of the entry (a long with the stop above the entry): invalid, should be flagged or auto-corrected.
- Inverted drawings: dragging the target through the entry should flip long to short or be prevented, not leave a half-valid box.
- Zero risk (stop equal to entry) has no meaningful ratio; OpenCandle shows 0.
- Log scale and percentage vs price confusion.
- Time width on weekends and gaps: width is time or bars.
- Fees, slippage and gaps through the stop are ignored by the tool.

## How OpenCandle does it
- The default stop is half the target's on-screen distance, so a fresh box on a log chart may not read exactly 2.00 reward to risk.
- Optional Stop from ATR: the stop is placed k x ATR from the entry (default 2 x ATR 14), and the position size is rounded down to whole lots.
- Stop equal to entry shows a ratio of 0 rather than "n/a".
- If one bar reaches both stop and target, the stop is taken first.
- The entry only counts as trading from the entry time on. The first bar trading through the entry price fills it.
- The quantity box stays readable on light backgrounds.

## Open questions
- Which values (quantity, P&L, point value) OpenCandle computes and what inputs it needs.
- Whether crossing the entry flips the side.
- Book citations in the sources list are background reading and were not re-checked line by line.
