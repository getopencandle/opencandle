---
id: chaikinosc
name: Chaikin oscillator
kind: indicator
family: volume
sources:
  - title: ChartSchool, Chaikin Oscillator
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/chaikin-oscillator
    type: secondary
  - title: Chaikin's original publication (not located)
    author: Marc Chaikin
    year: n/a
    url: book
    type: primary
confidence: medium
---

## Purpose
Applies the MACD idea to the Accumulation Distribution Line (ADL): the momentum of money flow, intended to turn before the ADL does.

## How the author meant it to be used
ChartSchool, crediting Marc Chaikin: the oscillator is the 3-period EMA of the ADL minus its 10-period EMA. It is an "indicator of an indicator", at least three steps from price, and so more prone to disconnect from price. Positive means the ADL is rising and buying pressure prevails; negative means selling pressure. Signals are zero-line crosses and divergences against price. The (3,10) default crosses zero often; lengthening both averages (for example 6 and 20) smooths it.

## How you interact with it
Automatic. Fast and slow lengths are the only inputs. The ADL is cumulative from the first loaded bar, so its absolute level depends on how much history is loaded; the oscillator, a difference of EMAs, changes little once seeded. Value known at bar close.

## Calculation
Multiplier = ((close - low) - (high - close)) / (high - low). Money flow volume = multiplier x volume. ADL = previous ADL + money flow volume. Oscillator = EMA(ADL, 3) - EMA(ADL, 10).

## Standard defaults
3 and 10.

## Reading it
Above zero buying pressure, below zero selling pressure; divergences warn ahead of zero crosses. Magnitude is in volume units, so compare only within the same symbol.

## Common mistakes and edge cases
- Using CMF-style windowed sums instead of the cumulative ADL.
- Zero-range bars give a zero multiplier (avoid divide by zero).
- EMA seeding (SMA seed vs first value) changes the first bars.
- Different volume definitions change the series for the same chart.

## How OpenCandle does it
- The Accumulation Distribution Line is counted from the first loaded bar, so its level depends on how much history is loaded. The oscillator is a difference of averages and changes little once it has started.
- Both averages start from a simple average of the first values, then run as exponential averages.
- A bar with no range gets a zero money flow multiplier. A missing bar shows no value but the running total carries on.
- Defaults are 3 and 10.

## Open questions
The ADL starting value (zero at the first loaded bar) is a convention; history-length effects on early values are not documented in the source.
