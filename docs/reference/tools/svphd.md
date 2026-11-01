---
id: svphd
name: Session volume profile HD
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
confidence: low
---

## Purpose
A higher-resolution session profile over the visible price range; it shows finer volume structure than the standard session profile.

## How the author meant it to be used
Market Profile was developed by J. Peter Steidlmayer at the Chicago Board of Trade. The original counts time at price (TPO letters per half-hour), not volume; the volume histogram is its modern analogue. His key ideas: the point of control (POC) is the price with the most activity; the value area is the range around the POC holding about 70% of the activity; price outside the value area tends to be rejected or to draw rotation back toward it. The 70% figure and the construction come from secondary descriptions. ChartSchool's Volume-by-Price is a simpler cousin: it sorts the period's closes into 12 equal price zones, totals the volume whose close falls in each zone, optionally splits it into up-day and down-day volume, and reads long bars as support or resistance. Its stated caveat: the bars use all data on the chart, so they identify current, not past, support and resistance, and gaps can leave zero-volume zones. 'HD' is not an author's term. It denotes a profile using finer rows and, where possible, lower-timeframe data to place each bar's volume; no single source defines it.

## How you interact with it
Automatic once added. You set the session, rows (default higher than the standard profile), volume mode, value area, placement and width. The row grid follows the visible price range, so panning or zooming vertically re-bins the profile; the session profiles themselves are recomputed from the bars in each session. Live-session profile changes until the session ends.

## Calculation
Rows: the price range is split into equal rows, by a row count (OpenCandle default 24) or by a row size in price. Volume per row: the common conventions are to assign a bar's whole volume to its close (ChartSchool), to spread it across the rows between its low and high, or to place it at one price; lower-timeframe data gives a finer split. OpenCandle can also split each row into up volume and down volume (default Up/Down). POC = row with the highest volume. Value area: start at the POC and add the larger of the next two rows above or below (or one row at a time) until the stated share of total volume (OpenCandle default 70%) is covered; the top and bottom rows give VAH and VAL. Tie-breaking and one-row versus two-row expansion vary by tool and shift the boundaries slightly. OpenCandle spreads each bar's volume across the rows its high-low range covers, in proportion to the overlap, and builds the value area two rows at a time (the pair above or below with more volume is added; ties add the upper pair). Higher resolution means more, thinner rows (OpenCandle default 100) over the visible price range, and ideally intrabar volume placement from lower-timeframe bars.

## Standard defaults
Session extended, rows 100, value area 70%, placed left. OpenCandle's inputs (rows layout and size, volume mode, value area percent, placement, width) and defaults are its own choices; nothing here is a published standard.

## Reading it
As the session profile, with more detail about small volume nodes. Fine rows can show spurious peaks on thin data.

## Common mistakes and edge cases
- Row count too small loses structure; too large makes each row noisy.
- Close-only placement versus high-low spreading gives different shapes.
- Instruments with no real volume (some forex and index data) produce meaningless profiles.
- Different value-area expansion rules give boundaries that differ by a row or two.
- The POC of a still-forming profile can move until the period ends.
- Very fine rows over thin volume look like noise rather than structure.

## How OpenCandle does it
- Row height is the visible price range divided by Row Size (default 100). The same height is used for every session, raised if a session would otherwise exceed the row limit.
- Because rows depend on the visible price range, panning or zooming vertically changes the profile, and it cannot be used in alerts.
- Each bar's volume is spread over the rows its high-low range covers, in proportion to the overlap. A bar with no range goes into one row. Finer bars are used when available.
- The value area is built two rows at a time from the point of control: the pair above or below with more volume is added, ties go up, until 70% is covered. If the point of control has a tie, the row nearest the middle of the range wins, then the lower one.
- Close at or above open counts as up volume.

## Open questions
No author defines HD. Which lower-timeframe data OpenCandle uses and its fidelity are OpenCandle's. Confidence is low because there is no primary source.
