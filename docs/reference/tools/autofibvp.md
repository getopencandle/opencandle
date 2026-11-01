---
id: autofibvp
name: Auto Fibonacci range with volume profile
kind: indicator
family: Fibonacci
sources:
  - title: Market Profile guide with value area walkthrough
    author: Aron Groups
    year: n/a
    url: https://arongroups.co/?p=197980
    type: secondary
  - title: Mind Over Markets
    author: James Dalton, Eric Jones and Robert Dalton
    year: 1990
    url: book
    type: primary
  - title: ChartSchool, Fibonacci Retracements
    author: StockCharts
    year: n/a
    url: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/fibonacci-retracements
    type: secondary
confidence: low
---

## Purpose
Draws Fibonacci levels over a detected range and shows a volume profile of that same range, so retracement levels can be compared with where volume actually traded.

## How the author meant it to be used
The combination has no single author. The profile side comes from Market Profile (J. Peter Steidlmayer at the Chicago Board of Trade, popularised in Mind Over Markets): activity at each price level, with the point of control (POC, the price with the most activity; for TPO profiles, the longest row) and a value area, conventionally about 70 percent of the activity around the POC. The 70 percent is a rounded convention that echoes one standard deviation (about 68 percent), not a measured statistic. High volume nodes are read as accepted prices that act like support or resistance; low volume nodes as areas price tends to cross quickly (practitioner reading). Fibonacci retracements follow ChartSchool's convention described under auto Fibonacci. The idea of the pairing is confluence.

## How you interact with it
Automatic. The range is detected, not placed by you. Choose the Fib range: Short (50 bars), Medium (150, the default), Long (400), or the Auto fib retracement zig zag swing (deviation 3%, depth 10). The profile resolution is adjustable. The Fibonacci levels of the same swing are drawn alongside the profile, so levels and volume can be compared directly. The profile of a range that is still extending changes as bars arrive.


## Calculation
Range = the swing chosen above, from A to B. Fib levels = B - ratio * (B - A), drawn for the same swing. Profile: divide the price span into rows and assign each bar's volume to the rows its high-low spans (evenly across the span is the common approximation, or all to the close); sum per row. OpenCandle spreads volume in proportion to the overlap with each row and runs the profile from the swing start through the last bar. Point of control = row with the largest sum; on a tie the row nearer the middle of the range is picked, then the lower one.

Value area, classic construction (described in Market Profile teaching material attributed to the CBOT and Mind Over Markets): start at the POC. Sum the two rows directly above the current value area and, separately, the two rows directly below it. Add the heavier pair to the value area. Repeat until the included total reaches 70 percent of all activity. Because whole pairs of rows are added, the result usually lands slightly above 70 percent. The rule was written for volume and used with time-based counts (TPOs) when volume is missing. A one-row-at-a-time variant also exists, comparing the adjacent rows and extending toward the larger; the two can give different value areas. OpenCandle uses the two-row method.


## Standard defaults
Fib levels 23.6, 38.2, 50, 61.8 (ChartSchool's set). Value area 70 percent (Market Profile convention). Row count is a tool choice (commonly 24 to 100).

## Reading it
Look for Fibonacci levels near the POC, value area edges or high volume nodes. A retracement into a low volume node is expected to move quickly; into a high volume node it may stall (practitioner view). Retracement levels are alert zones, not exact levels (ChartSchool).

## Common mistakes and edge cases
- Missing volume (forex, some indices): the profile is meaningless; the tool must say so.
- Assigning a bar's whole volume to one price when ranges are wide.
- Reading the profile of a range that is still extending as if it were final.
- Intraday bars within a profile whose session boundaries differ from the range.
- Row resolution too fine or too coarse for the range.
- Mixing the two-row and one-row value area methods when comparing tools.

## How OpenCandle does it
- Draws the Fibonacci levels (0, 23.6, 38.2, 50, 61.8, 78.6 and 100 percent) of the same swing that sets the profile range, in the Auto fib retracement colours.
- The profile runs from the swing start through the last bar, not only from A to B.
- Volume is spread over each bar's high-to-low range in proportion to the overlap with each row.
- The value area is built two rows at a time, as in the other volume profiles; the POC tie goes to the row nearer the middle, then the lower one.

## Open questions
Unverified: the text of Mind Over Markets and the CBOT handbook; the two-row rule is known only through a secondary walkthrough. No source defines this exact combination. Which value area variant and volume distribution OpenCandle uses should be confirmed from the implementation.
