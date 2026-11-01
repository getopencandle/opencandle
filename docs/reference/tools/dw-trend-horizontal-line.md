---
id: dw-trend-horizontal-line
name: Horizontal line
kind: drawing
family: trend lines
sources:
  - title: Support & Resistance (ChartSchool)
    author: StockCharts.com
    year: 2024
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/support-and-resistance
    type: secondary
  - title: Common charting convention (no single author)
    author: various
    year: n/a
    url: common charting convention
    type: secondary
confidence: high
---

## Purpose
A line at a single price extending across the whole chart in both directions. It marks a support, resistance, target or stop level.

## How the author meant it to be used
ChartSchool defines support and resistance as price levels where demand or supply is thought strong enough to halt a move, set by prior reaction lows and highs; it adds that levels are better treated as zones and that broken support often becomes resistance. A horizontal line is the simplest representation. No single author.

## How you draw it
One click at the desired price; the click time is irrelevant to position. It can be dragged up and down; it has no second point. A price label sits on the price axis. Hotkey in OpenCandle: Alt + H, which places it at the cursor level. It is defined by price only, so it stays at that price on interval change and zoom.

## Geometry and levels
y = p at every time. Still horizontal on a log scale. If magnet snapping is on, the price is the nearest open, high, low or close within a pixel tolerance.

## Standard defaults
Single line with a price label on the axis; colour and width are your settings.

## Reading it
Used for round numbers, prior highs and lows, and breakout levels. Zone traders pair two lines into a band. A close beyond the line is the usual definition of a break, but that is your choice.

## Common mistakes and edge cases
- No time anchor, so it cannot mean 'from this bar onward'; use the Horizontal ray.
- The price label should follow the instrument's tick decimals.
- Percent or indexed axis modes change the label, not the stored price.
- Dragging should follow the cursor exactly without snapping jitter.

## Open questions
- Whether the label updates in percent mode.
- The sources describe support and resistance generally, not this tool.
