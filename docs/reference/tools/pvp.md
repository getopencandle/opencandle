---
id: pvp
name: Periodic volume profile
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
Builds one volume profile per calendar period (day, week, month and so on), drawn side by side so you can see how accepted prices move from period to period.

## How the author meant it to be used
Market Profile was developed by J. Peter Steidlmayer at the Chicago Board of Trade. The original counts time at price (TPO letters per half-hour), not volume; the volume histogram is its modern analogue. His key ideas: the point of control (POC) is the price with the most activity; the value area is the range around the POC holding about 70% of the activity; price outside the value area tends to be rejected or to draw rotation back toward it. The 70% figure and the construction come from secondary descriptions. ChartSchool's Volume-by-Price is a simpler cousin: it sorts the period's closes into 12 equal price zones, totals the volume whose close falls in each zone, optionally splits it into up-day and down-day volume, and reads long bars as support or resistance. Its stated caveat: the bars use all data on the chart, so they identify current, not past, support and resistance, and gaps can leave zero-volume zones. The idea of one profile per trading day is Steidlmayer's; extending it to weeks or months is a later convention with no single author.

## How you interact with it
Automatic once added. You pick the period (Auto, Session, Day, Week or Month; quarter and year occur only through Auto), the rows and volume settings, and placement. Each period gets its own histogram, measured from the period's first or last bar. The current period is still forming, so its profile and POC change with every new bar; completed periods are fixed. OpenCandle reports the signal causally, so a profile uses only data up to the bar being evaluated. Interval changes re-bin each period from the new bars.

## Calculation
Rows: the price range is split into equal rows, by a row count (OpenCandle default 24) or by a row size in price. Volume per row: the common conventions are to assign a bar's whole volume to its close (ChartSchool), to spread it across the rows between its low and high, or to place it at one price; lower-timeframe data gives a finer split. OpenCandle can also split each row into up volume and down volume (default Up/Down). POC = row with the highest volume. Value area: start at the POC and add the larger of the next two rows above or below (or one row at a time) until the stated share of total volume (OpenCandle default 70%) is covered; the top and bottom rows give VAH and VAL. Tie-breaking and one-row versus two-row expansion vary by tool and shift the boundaries slightly. OpenCandle spreads each bar's volume across the rows its high-low range covers, in proportion to the overlap, and builds the value area two rows at a time (the pair above or below with more volume is added; ties add the upper pair). Each period is profiled on its own bars, with its own high and low. Period boundaries follow the exchange calendar of the instrument, which OpenCandle defines in its own way.

## Standard defaults
Period auto (day on intraday charts, then month, quarter, year as the chart interval grows), rows 24, value area 70%, placed left. OpenCandle's inputs (rows layout and size, volume mode, value area percent, placement, width) and defaults are its own choices; nothing here is a published standard.

## Reading it
Compare the POC and value area of consecutive periods: overlapping value areas suggest balance, a value area that moves clear of the previous one suggests a new price being accepted.

## Common mistakes and edge cases
- Row count too small loses structure; too large makes each row noisy.
- Close-only placement versus high-low spreading gives different shapes.
- Instruments with no real volume (some forex and index data) produce meaningless profiles.
- Different value-area expansion rules give boundaries that differ by a row or two.
- The POC of a still-forming profile can move until the period ends.
- Extended-hours bars included or excluded give very different profiles.
- Daily bars with a Session period equal the Day period.

## How OpenCandle does it
- Each bar's volume is spread over the rows its high-low range covers, in proportion to the overlap. A bar whose close is at or above its open counts as up volume.
- Value area is built two rows at a time from the point of control: the heavier pair above or below is added, ties go up, until 70 percent is reached. If two rows tie for the point of control, the one nearest the middle of the range wins, then the lower one.
- The Period input offers Auto, Session, Day, Week and Month; quarter and year occur only through Auto.
- The per-bar POC, VAH and VAL values are causal: they use only data up to that bar. The drawn histogram shows the whole period, and the current period updates with every bar.

## Open questions
Period definitions, session handling and the causal policy are OpenCandle's own.
