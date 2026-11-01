---
id: vrvp
name: Visible range volume profile
kind: profile
family: volume profile
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
  - title: ChartSchool, Volume-by-Price
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/volume-by-price
    type: secondary
confidence: medium
---

## Purpose
Builds one volume-at-price histogram from the bars currently visible on the chart, so it answers where volume traded in the window you are looking at.

## How the author meant it to be used
Market Profile was developed by J. Peter Steidlmayer at the Chicago Board of Trade. The original counts time at price (TPO letters per half-hour), not volume; the volume histogram is its modern analogue. His key ideas: the point of control (POC) is the price with the most activity; the value area is the range around the POC holding about 70% of the activity; price outside the value area tends to be rejected or to draw rotation back toward it. The 70% figure and the construction come from secondary descriptions. ChartSchool's Volume-by-Price is a simpler cousin: it sorts the period's closes into 12 equal price zones, totals the volume whose close falls in each zone, optionally splits it into up-day and down-day volume, and reads long bars as support or resistance. Its stated caveat: the bars use all data on the chart, so they identify current, not past, support and resistance, and gaps can leave zero-volume zones. There is no single author of a profile that follows the visible window; it applies the same idea to whatever range is on screen.

## How you interact with it
Automatic once added; you do not anchor it. The range is whatever bars are visible, so panning or zooming recomputes it from the new window. You set the rows layout (number of rows or row size), the row count or size, the volume mode (Up/Down, Total or Delta), the value area percent, left or right placement and histogram width. Nothing is known in advance: the profile for a window exists only from the bars in that window and changes as the window or new bars change it. Without a visible range (alerts, screener) OpenCandle uses every loaded bar. Changing interval re-bins the same time window from the new bars, which can shift the histogram.

## Calculation
Rows: the price range is split into equal rows, by a row count (OpenCandle default 24) or by a row size in price. Volume per row: the common conventions are to assign a bar's whole volume to its close (ChartSchool), to spread it across the rows between its low and high, or to place it at one price; lower-timeframe data gives a finer split. OpenCandle can also split each row into up volume and down volume (default Up/Down). POC = row with the highest volume. Value area: start at the POC and add the larger of the next two rows above or below (or one row at a time) until the stated share of total volume (OpenCandle default 70%) is covered; the top and bottom rows give VAH and VAL. Tie-breaking and one-row versus two-row expansion vary by tool and shift the boundaries slightly. OpenCandle spreads each bar's volume across the rows its high-low range covers, in proportion to the overlap, and builds the value area two rows at a time (the pair above or below with more volume is added; ties add the upper pair). For the visible range profile the price span is the high and low of the visible bars.

## Standard defaults
Rows 24, up/down volume, value area 70%, histogram 30% of the pane width, placed on the right, POC shown, VAH and VAL lines hidden by default. OpenCandle's inputs (rows layout and size, volume mode, value area percent, placement, width) and defaults are its own choices; nothing here is a published standard.

## Reading it
High-volume nodes tend to act as magnets and as support or resistance; low-volume gaps are passed through quickly. A close outside the value area suggests acceptance of new prices or a rejection. ChartSchool's caution applies: it describes the visible window only.

## Common mistakes and edge cases
- Row count too small loses structure; too large makes each row noisy.
- Close-only placement versus high-low spreading gives different shapes.
- Instruments with no real volume (some forex and index data) produce meaningless profiles.
- Different value-area expansion rules give boundaries that differ by a row or two.
- The POC of a still-forming profile can move until the period ends.
- A different zoom is a different profile; comparing profiles across zoom levels is misleading.

## How OpenCandle does it
- The profile covers every bar that overlaps the visible window and is recomputed when you pan or zoom.
- With no visible range (for example in alerts) every loaded bar is used.
- Volume mode can be Up/Down, Total or Delta.
- Each bar's volume is spread over the rows its high-low range covers, in proportion to the overlap. A bar with no range goes into one row. Finer bars are used when available.
- The value area is built two rows at a time from the point of control: the pair above or below with more volume is added, ties go up, until 70% is covered. If the point of control has a tie, the row nearest the middle of the range wins, then the lower one.
- Defaults are 24 rows and a 70% value area.

## Open questions
Whether rows are equal in price or in log-scale distance on a log chart.
