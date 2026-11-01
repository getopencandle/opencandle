---
id: srzones
name: Support and resistance zones
kind: indicator
family: structure
sources:
  - title: Technical Analysis of Stock Trends, support and resistance chapter (later edition than the 1948 original, so wording may differ)
    author: Robert D. Edwards and John Magee
    year: 1948
    url: book
    type: primary
  - title: ChartSchool, Support and Resistance
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/support-and-resistance
    type: secondary
  - title: Technical Analysis of the Financial Markets
    author: John J. Murphy
    year: 1999
    url: book
    type: secondary
confidence: medium
---

## Purpose
Shows price areas where the market has repeatedly turned, as bands with some thickness and not as exact lines.

## How the author meant it to be used
Edwards and Magee (9th edition text) define support as buying, actual or potential, sufficient in volume to halt a downtrend for an appreciable period, and resistance as the antithesis: selling sufficient to stop prices rising for a time. A support level is a price level where enough demand appears to hold a downtrend, and they speak of ranges and zones, a concentration of demand. They describe a support being broken when a reaction sifts down through the zone of the previous minor top, calling it a warning of a change in trend, stronger if activity increases, and they discuss the reversal of roles (broken support becoming resistance). Their text also says a level where a lot of shares traded becomes a support or resistance. ChartSchool agrees: levels are often better drawn as zones, tighter ranges justify more exact levels, broken support can turn into resistance and the reverse, and a trading range break is a win for the bulls or bears. No author defines automatic zone detection; the algorithms below are common practice.

## How you interact with it
Automatic. You may tune pivot strength, zone thickness and how many zones to show. Nothing is placed. Zones should be anchored to the time of the pivots that formed them and stay put; a zone that forms from a confirmed pivot should not shift when later bars arrive, though it may be extended, merged or retired.

## Calculation
Common method (not from the sources): find confirmed swing highs and lows (pivots needing N bars each side, so known N bars late); cluster pivots whose prices are within a tolerance (often a fraction of ATR or a percentage); the zone spans the cluster's min and max, with strength by number of touches. A zone is broken when price closes beyond it (not just wicks); ChartSchool gives the example that closing slightly below support need not mean the level is broken. Tolerance, whether wicks or closes define a touch, and the merge rule are all tool choices.

## Standard defaults
None from the authors. Common: pivots of 3 to 10 bars each side; zone width about 0.25 to 1 ATR (practitioner values).

## Reading it
More touches, more volume at the zone, and longer age make a zone more significant (consistent with Edwards and Magee on volume traded at the level); repeated tests may also weaken it (practitioner view). A break with a close and volume suggests role reversal.

## Common mistakes and edge cases
- Drawing exact lines where the authors speak of zones.
- Zones created from unconfirmed pivots that vanish.
- Tolerance fixed in price units across very different price levels.
- Gaps and thin history near the start.
- Log versus linear scale on long histories.

## How OpenCandle does it
- Pivots need 10 bars on each side, so a zone appears 10 bars after its pivot is made and never repaints before then.
- A zone is the pivot price plus and minus 0.25 times the 14-bar ATR, or the span from wick to body, depending on the setting. The ATR-based width scales with the price level.
- Zones that overlap are merged, and touches are counted for each zone.
- A close beyond the far side of a zone breaks it and retires it. A broken zone is drawn faded; it is not turned into the opposite kind (no role reversal).

## Open questions
No primary source defines algorithmic detection. OpenCandle's clustering and break rules should be documented from the implementation. Murphy's statements remain unverified.
