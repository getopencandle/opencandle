---
id: dw-volume-anchored-volume-profile
name: Anchored volume profile
kind: profile
family: volume profile
sources:
  - title: Volume-by-Price (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/volume-by-price
    type: secondary
  - title: Market Profile (volume at price)
    author: J. Peter Steidlmayer
    year: 1985
    url: book
    type: primary
confidence: medium
---

## Purpose
A horizontal histogram of traded volume by price level, computed from one chosen start bar up to the latest bar. It shows at which prices most volume traded since an event, and updates as new bars arrive.

## How the author meant it to be used
Volume at price originates in Market Profile (J. Peter Steidlmayer, Chicago Board of Trade, 1980s). ChartSchool's Volume-by-Price: the price range of the period is divided into equal zones, volume is totalled per zone, and heavy-volume zones are treated as support or resistance. ChartSchool uses the whole displayed period and assigns volume by closing price. The anchored form picks the start bar by hand and leaves the end open at the latest bar, unlike a fixed range profile where both ends are chosen.

## How you draw it
One click sets the anchor (start bar). The profile covers every bar from the anchor to the latest loaded bar and recomputes as bars arrive, so it is automatic after placement. The anchor can be dragged left or right and the profile changes. Row count, value area percentage and display options are settings. There is no end anchor. Interval change recomputes from the bar containing the anchor. In OpenCandle, missing or zero volume shows a visible notice at the anchor, with no zero substitution.

## Geometry and levels
The period's price range is divided into N equal rows (ChartSchool default 12; many profiles use far more). Each bar's volume goes to the row of its close (ChartSchool) or is spread over the rows its range covers (common refinement). The point of control (POC) is the row with the most volume. The value area holds rows around the POC with about 70 percent of total volume (a Market Profile convention). A developing profile, if shown, is the running POC or value area as bars accumulate.

## Standard defaults
ChartSchool: 12 rows. Value area 70 percent is the common convention. OpenCandle starts with 24 rows and a 70 percent value area; the point of control is shown by default and the value-area lines are hidden by default.

## Reading it
High-volume rows are acceptance areas that often act as support or resistance; low-volume rows are rejection areas price crosses quickly; the POC acts as a magnet. Anchoring to an event (earnings, a swing low, a regime change) shows where participants have positioned since then.

## Common mistakes and edge cases
- Including bars before the anchor or counting bars twice.
- Close-only versus range-spread allocation gives different shapes; document which is used.
- Missing volume (some index and FX data) must be reported, not drawn as a flat zero profile.
- Intraday volume inside a daily bar is unknown, so rows are coarse on a daily source.
- Equal rows in price look unequal on a log axis.

## How OpenCandle does it
- Starts with 24 rows, a 70 percent value area and the point of control shown; value-area lines are hidden by default.
- One click places the start bar, and the profile always runs to the latest loaded bar.
- If volume is missing for any bar from the anchor, or all of it is zero, a notice appears at the anchor instead of a blank or flat profile.

## Open questions
- Only ChartSchool's Volume-by-Price page covers this tool; Market Profile details are paraphrased.
