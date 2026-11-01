---
id: fixedrangevp
name: Fixed range volume profile
kind: drawing
family: volume
sources:
  - title: Steidlmayer on Markets
    author: J. Peter Steidlmayer and Kevin Koy
    year: 1989
    url: book
    type: primary
  - title: Markets and Market Logic
    author: J. Peter Steidlmayer and Steven B. Hawkins
    year: 1986
    url: book
    type: primary
  - title: Volume-by-Price (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/volume-by-price
    type: secondary
  - title: Market profile value area descriptions (vendor documentation)
    author: various
    year: 2024
    url: book
    type: secondary
confidence: medium
---

## Purpose
Shows how much volume traded at each price level inside a chosen time range, as a horizontal histogram. It reveals accepted price areas (high volume) and rejected areas (low volume).

## How the author meant it to be used
J. Peter Steidlmayer developed Market Profile at the Chicago Board of Trade in the 1960s and 70s. The original builds a profile of time (TPOs, one letter per half-hour bracket per price), not volume; the volume-at-price histogram is the volume analogue. The key ideas from Steidlmayer: the point of control (POC) is the price with the most activity; the value area is the range around the POC holding about 70% of the activity (secondary sources describe it as roughly one standard deviation of a normal distribution), and price outside the value area tends to be rejected or to attract rotation back toward it. ChartSchool describes a simpler version: Volume-by-Price bars from closes, used for current support and resistance, with the warning that bars from the whole visible period should not be used to judge past levels.

## How you draw it
Two clicks: the start and the end of the time range (the price range spans the high and low of all bars in the range, so only time needs choosing; some tools also let you fix the range in price). Both edges are draggable and the histogram recalculates. The histogram is anchored to the left (or right) of the range. A fixed range stays on its start and end times across interval changes; the profile is recalculated from the data of the new interval, so lower intervals give more precise volume placement (intraday data spreads a bar's volume over fewer prices). The profile is a price histogram, so it ignores bar spacing but depends on how each bar's volume is placed across price rows. On a log scale, rows should be of equal height in the displayed scale; equal-price rows on a log chart would look uneven (see open questions).

## Geometry and levels
Rows: the price range is divided into N equal rows (ChartSchool uses 12 by default; Market Profile uses the tick size). Volume per row: a bar's volume is assigned to the row of its close (ChartSchool), or spread across rows between its low and high (common alternative), or placed at the bar's typical price. Each row's up volume and down volume can be shown separately. POC = row with the highest volume. Value area: start at the POC and add rows outward, comparing the two rows above with the two rows below and adding the larger pair, until about 70% of total volume is included; the top and bottom of the included rows are VAH and VAL. Some implementations add one row at a time, which produces slightly different boundaries. Tie-breaking rules also differ between tools.

## Standard defaults
Row count about 24 to 100 (ChartSchool: 12); value area 70%; POC highlighted; VAH and VAL lines optional.

## Reading it
High-volume nodes act as magnets and support or resistance; low-volume nodes are passed through quickly. A close above or below the value area is a sign of acceptance of new prices or a rejection. Price inside the value area tends toward the POC. ChartSchool's warning: current bars identify current support and resistance, not past ones.

## Common mistakes and edge cases
- Row count so small the profile loses structure, or so large each row is noisy.
- Volume based on closes versus high-low spreading gives different shapes.
- Ranges with missing volume (some FX and index data).
- Gaps and weekends do not matter for the histogram but affect which bars are included.
- Very short ranges (one bar): single row dominated.
- Changing interval changes the result because the data placement changes.

## How OpenCandle does it
- The range starts on the bar containing the first anchor, on any interval.
- On a finer interval the range keeps the whole period of its last bar, so the profile does not change for a range you did not move.
- Each bar's volume is spread across its high-low range, and each bar is counted once.
- The value area grows one row at a time (the larger single neighbour; ties go down), not two rows at a time. POC ties go to the lowest row.
- 24 rows, equal in price (so they look uneven on a log chart). The price range spans only bars that have volume.

## Open questions
- Which volume placement method and value-area expansion rule OpenCandle uses.
- Whether rows are equal in price or in the displayed (log) scale.
- Whether the range snaps to bars and what happens when the range extends past loaded data.
- Book citations in the sources list are background reading and were not re-checked line by line.
