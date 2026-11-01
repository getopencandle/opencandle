---
id: rbknoxville
name: Rob Booker - Knoxville divergence
kind: indicator
family: signals
sources:
  - title: Rob Booker's Knoxville Divergence (Tom DeMark momentum plus RSI), own materials not located
    author: Rob Booker
    year: n/a
    url: book
    type: primary
  - title: Third-party script descriptions
    author: various
    year: n/a
    url: n/a
    type: secondary
confidence: low
---

## Purpose
A counter-trend reversal signal: a momentum divergence confirmed by an overbought or oversold RSI.

## How the author meant it to be used
Booker's own rules are not published in the sources used. A common description gives the idea as momentum divergence with RSI confirmation: a bearish signal is price at a new high while momentum is falling and RSI is overbought; bullish is the mirror with oversold RSI. Third-party scripts vary (one uses price lower low with RSI higher low and momentum above zero), and none show 21 and 20 as defaults, so the settings used by OpenCandle (bars back 150, RSI 21, momentum 20) are its own choice.

## How you interact with it
Automatic overlay. Set bars back, RSI period and momentum period. Nothing is placed. Signals appear on the signal bar and use only bars up to it, so they do not repaint; each signal draws a line from the earlier swing to the signal bar with a KD label. Because swings need neighbours, the earlier swing is found within the bars-back window.

## Calculation
OpenCandle's definition: find a swing high (high at least both neighbours), compare against the newest qualifying earlier swing within bars back, require momentum (close change over the momentum period) to disagree with price, and RSI to be above 70 (bearish) or below 30 (bullish) at some bar in the span from the earlier swing to the signal bar, with no higher high in between. These swing and newest-swing rules are OpenCandle's own choices.

## Standard defaults
Bars back 150, RSI 21, momentum 20; RSI thresholds 70 and 30.

## Reading it
A KD label is a warning of exhaustion, not an entry by itself. In strong trends overbought RSI can persist and the signal can fail.

## Common mistakes and edge cases
- Signalling on the earlier swing bar rather than the signal bar.
- Confusing the RSI level condition with the divergence condition.
- Re-signalling the same divergence on every subsequent bar (OpenCandle signals each divergence once).

## How OpenCandle does it
- Swing test: a swing high is a high at least equal to both neighbours. The signal compares against the newest qualifying earlier swing within the bars-back window, with no higher high in between.
- RSI must be above 70 (bearish) or below 30 (bullish) at some bar in the span from that earlier swing to the signal bar, not necessarily on the signal bar itself.
- Each earlier swing signals at most once per direction, so one divergence gives one signal.
- Defaults are bars back 150, RSI 21, momentum 20. These and the swing rules are OpenCandle's own choices.

## Open questions
The original Knoxville rules (what counts as momentum disagreement, window and exact thresholds) are not documented, so OpenCandle's version may differ.
