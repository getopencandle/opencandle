---
id: aavp
name: Auto anchored volume profile
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
Builds a volume profile from an automatically chosen anchor bar to the latest bar, so the profile always spans the most recent meaningful stretch.

## How the author meant it to be used
Market Profile was developed by J. Peter Steidlmayer at the Chicago Board of Trade. The original counts time at price (TPO letters per half-hour), not volume; the volume histogram is its modern analogue. His key ideas: the point of control (POC) is the price with the most activity; the value area is the range around the POC holding about 70% of the activity; price outside the value area tends to be rejected or to draw rotation back toward it. The 70% figure and the construction come from secondary descriptions. ChartSchool's Volume-by-Price is a simpler cousin: it sorts the period's closes into 12 equal price zones, totals the volume whose close falls in each zone, optionally splits it into up-day and down-day volume, and reads long bars as support or resistance. Its stated caveat: the bars use all data on the chart, so they identify current, not past, support and resistance, and gaps can leave zero-volume zones. Anchoring a profile to an event bar follows from the anchored VWAP idea; anchors like the highest high, lowest low, or recent swing are later conventions with no single author, so the author is treated as unknown.

## How you interact with it
Automatic: you do not click an anchor, they choose how the anchor is found (Highest High, Lowest Low or Highest Volume over the last Length bars, or the start of a Session, Week, Month, Quarter or Year) and a length. The profile runs from that anchor to the latest bar, so it grows as bars arrive and is re-anchored when the rule picks a different bar, which means the profile start can jump on a later bar as the window slides. None of the anchor rules needs confirmation bars.

## Calculation
Rows: the price range is split into equal rows, by a row count (OpenCandle default 24) or by a row size in price. Volume per row: the common conventions are to assign a bar's whole volume to its close (ChartSchool), to spread it across the rows between its low and high, or to place it at one price; lower-timeframe data gives a finer split. OpenCandle can also split each row into up volume and down volume (default Up/Down). POC = row with the highest volume. Value area: start at the POC and add the larger of the next two rows above or below (or one row at a time) until the stated share of total volume (OpenCandle default 70%) is covered; the top and bottom rows give VAH and VAL. Tie-breaking and one-row versus two-row expansion vary by tool and shift the boundaries slightly. OpenCandle spreads each bar's volume across the rows its high-low range covers, in proportion to the overlap, and builds the value area two rows at a time (the pair above or below with more volume is added; ties add the upper pair). The span runs from the anchor bar to the last bar.

## Standard defaults
Anchor auto, length 20, rows 24, value area 70%, placed left. OpenCandle's inputs (rows layout and size, volume mode, value area percent, placement, width) and defaults are its own choices; nothing here is a published standard.

## Reading it
Use it like any profile: the POC and value area of the stretch since the anchor event are the accepted prices of the current move.

## Common mistakes and edge cases
- Row count too small loses structure; too large makes each row noisy.
- Close-only placement versus high-low spreading gives different shapes.
- Instruments with no real volume (some forex and index data) produce meaningless profiles.
- Different value-area expansion rules give boundaries that differ by a row or two.
- The POC of a still-forming profile can move until the period ends.
- The anchor can move as the window slides, which repaints the start of the profile.
- Different anchor rules give very different profiles.

## How OpenCandle does it
- The anchor is found by a rule, never placed by a click: Highest High, Lowest Low or Highest Volume over the last Length bars (default 20), or the start of a Session, Week, Month, Quarter or Year. Auto uses the Session on intraday charts, the Month from daily, the Quarter from weekly and the Year from monthly.
- The extreme-bar anchors pick the extreme bar of the last Length bars, and the latest one on a tie. They need no confirmation bars, so the anchor can move as the window slides.
- The profile runs from the anchor to the last bar and is recalculated as bars arrive. Each bar's volume is spread over the rows its high-to-low range covers, in proportion to the overlap.
- The value area is built two rows at a time, adding the heavier pair above or below the POC (the upper pair on a tie), until 70% of the volume is covered. If two rows tie for the POC, the one nearer the middle of the range wins, then the lower one.
- The POC, VAH and VAL values on every bar since the anchor are the current final levels, so past values change when the profile changes. Alerts read the current levels only.

## Open questions
No author or standard defines the auto-anchor choices; the anchor rules are OpenCandle's own. Confidence is low because there is no primary source.
