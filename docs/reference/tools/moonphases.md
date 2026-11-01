---
id: moonphases
name: Moon phases
kind: indicator
family: calendar / cycles
sources:
  - title: Astronomical Algorithms (chapter 49, phases of the Moon)
    author: Jean Meeus
    year: 1991
    url: book
    type: primary
  - title: Lunar-cycle market folklore
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: medium
---

## Purpose
Marks the dates of new moons and full moons on the chart so you can look for a lunar-cycle effect in price. There is no accepted evidence behind the idea; it is a calendar overlay, not a signal generator.

## How the author meant it to be used
The astronomy is Meeus: the instant of each new or full moon is a mean phase (a linear function of the lunation number k, with k whole for new moon and k plus 0.5 for full moon) plus a sum of periodic correction terms in the sun's and moon's anomalies; the full set has about 25 terms and the largest few give minute-level accuracy; OpenCandle uses 14. The trading use comes from market folklore that turning points cluster near new or full moons. Treat any claim of predictive value with scepticism.

## How you interact with it
Automatic. No inputs and nothing to place. The phases are astronomical, so they do not depend on price and can be computed for future dates. Because a phase instant is fixed in advance, the marker on a given bar never changes and there is no repainting. A phase that falls between bars (weekend, overnight) must be assigned to a bar by some rule (OpenCandle uses the next bar; an OpenCandle choice).

## Calculation
Mean phase JDE = 2451550.09766 + 29.530588861 k + small k-squared terms; add the periodic terms (sun anomaly M, moon anomaly M', argument of latitude F, node Omega, plus additional planetary terms) to get the instant in dynamical time; convert to UT and then to the chart's time zone.

## Standard defaults
None. Two event types: new moon and full moon.

## Reading it
Markers only. Users compare price behaviour around the markers; no standard interpretation exists.

## Common mistakes and edge cases
- Using UTC instants but placing them on the exchange-local date, shifting a marker by a day.
- Placing a phase that falls on a non-trading day on the previous bar instead of the next bar; both are conventions, pick one and state it.
- Using a fixed 29.53-day period from one known new moon: it drifts by hours because the real lunation varies by up to about 14 hours.
- Intraday charts: the marker should land on the bar containing the instant, not just the day.

## How OpenCandle does it
- Uses Meeus's algorithm with 14 periodic terms. Phase times land within about 2 minutes of published almanac times.
- Marks only new moons and full moons, not quarters.
- A phase that falls between bars (weekend, overnight) is placed on the next bar.

## Open questions
Exact assignment rule for non-trading instants and intraday bars; whether to also mark first and last quarter (the book covers them; OpenCandle marks only new and full).
