---
id: volumedelta
name: Volume delta
kind: indicator
family: volume
sources:
  - title: Inferring Trade Direction from Intraday Data (tick rule)
    author: Charles Lee and Mark Ready
    year: 1991
    url: book
    type: secondary
  - title: OpenCandle indicator definition
    author: OpenCandle
    year: n/a
    url: common charting convention
    type: secondary
confidence: low
---

## Purpose
Shows, for each chart bar, the running buy-minus-sell volume path inside the bar as an open-high-low-close candle, so you see not just the net delta but how it got there.

## How the author meant it to be used
No single author. Delta (buy volume minus sell volume) comes from order-flow and footprint analysis; the classification of volume by direction is the tick rule associated with Lee and Ready (1991), but the rule itself is not reproduced from that paper. Common practice reads a positive closing delta as net buying in the bar, a negative one as net selling, and the candle's high and low as the extremes of imbalance reached during the bar. A bar whose price rises while the delta candle closes negative is read as buyers failing to commit.

## How you interact with it
Automatic. It reads finer bars (automatic interval, or a custom timeframe you choose) inside each chart bar. A chart bar with no finer bars stays blank. The candle for the live bar changes as finer bars arrive; its open is always zero, and the close is final only at the bar's close. Nothing is placed or dragged.

## Calculation
Each finer bar is signed: up if close is above open, down if below; if equal, by close against the previous finer bar's close; if equal again it carries the previous sign (tick-rule zero tick). The signed volume is the bar's whole volume times that sign. Within a chart bar the signed volumes accumulate from zero in time order: open is 0, close is the final sum, high and low are the maximum and minimum of the running sum. Unlike CVD, it does not carry over from one chart bar to the next.

## Standard defaults
Automatic interval, no custom timeframe. These are OpenCandle's choices.

## Reading it
Candle colour and body show direction and size of net volume per bar. The scale is in volume units, not price.

## Common mistakes and edge cases
- Expecting it to be cumulative across bars; that is Cumulative volume delta.
- Treating the sign as true aggressor side; it is inferred from finer-bar colour.
- Blank bars where finer data is missing.
- Equal-close finer bars inherit the earlier sign, which can bias quiet periods.

## How OpenCandle does it
- Each finer bar is signed by close against open, then by close against the previous finer bar's close, then by carrying the previous sign. The whole finer bar's volume takes that sign.
- The candle starts at zero for every chart bar and does not carry over from one bar to the next (unlike CVD).
- A chart bar with no finer bars stays blank.

## Open questions
No primary reference defines the open-high-low-close presentation; it is a presentation choice. How other tools break ties on unchanged finer bars may differ.
