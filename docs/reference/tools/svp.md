---
id: svp
name: Session volume profile
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
Builds one volume profile per trading session, so each day's accepted price range shows as a separate histogram.

## How the author meant it to be used
Market Profile was developed by J. Peter Steidlmayer at the Chicago Board of Trade. The original counts time at price (TPO letters per half-hour), not volume; the volume histogram is its modern analogue. His key ideas: the point of control (POC) is the price with the most activity; the value area is the range around the POC holding about 70% of the activity; price outside the value area tends to be rejected or to draw rotation back toward it. The 70% figure and the construction come from secondary descriptions. ChartSchool's Volume-by-Price is a simpler cousin: it sorts the period's closes into 12 equal price zones, totals the volume whose close falls in each zone, optionally splits it into up-day and down-day volume, and reads long bars as support or resistance. Its stated caveat: the bars use all data on the chart, so they identify current, not past, support and resistance, and gaps can leave zero-volume zones. The session profile is closest to Steidlmayer's original use: one profile for each trading day.

## How you interact with it
Automatic once added. You pick which session counts (regular only or extended) and the usual rows, volume, value area, placement and width settings. Each session is profiled from its first to last bar; the live session is still forming and its profile changes until the session ends. Nothing is placed or anchored by you. Interval changes re-bin each session; on daily or longer bars a session is one bar, so the profile is trivial.

## Calculation
Rows: the price range is split into equal rows, by a row count (OpenCandle default 24) or by a row size in price. Volume per row: the common conventions are to assign a bar's whole volume to its close (ChartSchool), to spread it across the rows between its low and high, or to place it at one price; lower-timeframe data gives a finer split. OpenCandle can also split each row into up volume and down volume (default Up/Down). POC = row with the highest volume. Value area: start at the POC and add the larger of the next two rows above or below (or one row at a time) until the stated share of total volume (OpenCandle default 70%) is covered; the top and bottom rows give VAH and VAL. Tie-breaking and one-row versus two-row expansion vary by tool and shift the boundaries slightly. OpenCandle spreads each bar's volume across the rows its high-low range covers, in proportion to the overlap, and builds the value area two rows at a time (the pair above or below with more volume is added; ties add the upper pair). Each session uses its own high-low range and its own total volume for the value area.

## Standard defaults
Session extended, rows 24, value area 70%, placed left. OpenCandle's inputs (rows layout and size, volume mode, value area percent, placement, width) and defaults are its own choices; nothing here is a published standard.

## Reading it
Use yesterday's POC and value area as reference levels for today. Price accepted inside the value area tends to rotate toward the POC; sustained trade outside it suggests a new value area is forming.

## Common mistakes and edge cases
- Row count too small loses structure; too large makes each row noisy.
- Close-only placement versus high-low spreading gives different shapes.
- Instruments with no real volume (some forex and index data) produce meaningless profiles.
- Different value-area expansion rules give boundaries that differ by a row or two.
- The POC of a still-forming profile can move until the period ends.
- Including pre- and after-hours volume (thin) can pull the POC away from where the main session traded.
- On intervals longer than a day it draws one profile per bar date, and Regular and Extended give the same result there.

## How OpenCandle does it
- One profile per session. The POC, VAH and VAL values on each bar use only data up to that bar, while the drawn histogram shows the whole session.
- The live session updates with every bar.
- Each bar's volume is spread over the rows its high-low range covers, in proportion to the overlap. A bar with no range goes into one row. Finer bars are used when available.
- The value area is built two rows at a time from the point of control: the pair above or below with more volume is added, ties go up, until 70% is covered. If the point of control has a tie, the row nearest the middle of the range wins, then the lower one.
- Close at or above open counts as up volume.
- On intervals longer than a day it draws one profile per bar date, and Regular and Extended give the same result.
- Defaults are 24 rows and a 70% value area.

## Open questions
How OpenCandle defines extended hours and handles instruments without sessions. Steidlmayer's own value-area rules were not verified.
